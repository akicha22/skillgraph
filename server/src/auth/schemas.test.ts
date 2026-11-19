import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatZodIssues, loginSchema, registerSchema } from "./schemas.js";

const validRegistration = {
  name: "Meera Kulkarni",
  email: "meera@skillgraph.test",
  password: "Password123",
  role: "CANDIDATE",
};

describe("registerSchema — privileged fields", () => {
  it("accepts a candidate or recruiter registration", () => {
    assert.equal(registerSchema.safeParse(validRegistration).success, true);
    assert.equal(
      registerSchema.safeParse({ ...validRegistration, role: "RECRUITER" }).success,
      true,
    );
  });

  it("rejects a role outside the two the app supports", () => {
    for (const role of ["ADMIN", "SUPERUSER", "admin", ""]) {
      assert.equal(
        registerSchema.safeParse({ ...validRegistration, role }).success,
        false,
        `role "${role}" must be rejected`,
      );
    }
  });

  it("drops fields that were not part of the contract", () => {
    const parsed = registerSchema.safeParse({ ...validRegistration, isDemo: true });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    // A registrant cannot mark themselves as a demo account or set a hash.
    assert.equal("isDemo" in parsed.data, false);
    assert.equal("passwordHash" in parsed.data, false);
  });
});

describe("registerSchema — normalisation", () => {
  it("trims the name and lowercases the email", () => {
    const parsed = registerSchema.safeParse({
      ...validRegistration,
      name: "  Meera Kulkarni  ",
      email: "  Meera@SkillGraph.TEST ",
    });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.name, "Meera Kulkarni");
    assert.equal(parsed.data.email, "meera@skillgraph.test");
  });
});

describe("registerSchema — passwords and email", () => {
  const rejected = (input: typeof validRegistration, field: string) => {
    const parsed = registerSchema.safeParse(input);
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.ok(
      formatZodIssues(parsed.error).some((issue) => issue.field === field),
      `expected an issue on "${field}" for ${JSON.stringify(input)}`,
    );
  };

  it("rejects short, long, letterless or digitless passwords", () => {
    rejected({ ...validRegistration, password: "Ab1" }, "password");
    rejected({ ...validRegistration, password: "onlyletters" }, "password");
    rejected({ ...validRegistration, password: "1234567890" }, "password");
    rejected({ ...validRegistration, password: `${"a1".repeat(37)}` }, "password");
  });

  it("rejects a name that is too short", () => {
    rejected({ ...validRegistration, name: "M" }, "name");
  });

  it("rejects an address that is not an email", () => {
    rejected({ ...validRegistration, email: "meera.skillgraph.test" }, "email");
  });
});

describe("loginSchema", () => {
  it("normalises the email the same way registration stores it", () => {
    const parsed = loginSchema.safeParse({ email: "  Meera@SkillGraph.test ", password: "x" });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.email, "meera@skillgraph.test");
  });

  it("rejects an empty password or an oversized one", () => {
    assert.equal(loginSchema.safeParse({ email: "a@b.co", password: "" }).success, false);
    assert.equal(
      loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success,
      false,
    );
  });
});

describe("formatZodIssues", () => {
  it("reports a field path and a readable message", () => {
    const parsed = registerSchema.safeParse({ ...validRegistration, email: "nope" });
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const issues = formatZodIssues(parsed.error);
    assert.ok(issues.length > 0);
    const emailIssue = issues.find((issue) => issue.field === "email");
    assert.ok(emailIssue);
    assert.match(emailIssue.message, /valid email/i);
  });

  it("uses an empty field for an issue on the whole body", () => {
    const parsed = registerSchema.safeParse("not an object");
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.deepEqual(formatZodIssues(parsed.error).map((issue) => issue.field), [""]);
  });
});
