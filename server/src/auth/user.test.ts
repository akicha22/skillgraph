import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicUserSelect, toPublicUser } from "./user.js";

describe("toPublicUser", () => {
  const stored = {
    id: "usr_1",
    email: "priya@skillgraph.test",
    name: "Priya Nair",
    role: "RECRUITER",
    isDemo: true,
    passwordHash: "$2b$10$super-secret-hash",
    updatedAt: new Date("2026-11-01T00:00:00Z"),
  };

  it("returns only the public fields", () => {
    const user = toPublicUser(stored);
    assert.deepEqual(Object.keys(user).sort(), ["email", "id", "isDemo", "name", "role"]);
    assert.deepEqual(user, {
      id: "usr_1",
      email: "priya@skillgraph.test",
      name: "Priya Nair",
      role: "RECRUITER",
      isDemo: true,
    });
  });

  it("never lets the password hash reach a response body", () => {
    const json = JSON.stringify(toPublicUser(stored));
    assert.equal(json.includes("passwordHash"), false);
    assert.equal(json.includes("super-secret-hash"), false);
  });

  it("carries the role the database returned, so a token cannot change it", () => {
    assert.equal(toPublicUser({ ...stored, role: "CANDIDATE" }).role, "CANDIDATE");
  });
});

describe("publicUserSelect", () => {
  it("selects exactly the public columns and never the password hash", () => {
    assert.deepEqual(Object.keys(publicUserSelect).sort(), ["email", "id", "isDemo", "name", "role"]);
    assert.equal("passwordHash" in publicUserSelect, false);
  });
});
