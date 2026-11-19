import "./testEnv.js"; // first: it sets the database and signing secret before the app loads
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { app } from "../app.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { TEST_DATABASE_FILE } from "./testEnv.js";

/**
 * End-to-end permission tests. They start the real Express app on an ephemeral port against a
 * throwaway SQLite file in the OS temp directory — never dev.db — so the sign-in middleware, the
 * role guards and the owner filters in the queries are all exercised over HTTP.
 *
 * The rule being pinned down: 401 when signed out, 403 when the role is wrong, and 404 (not 403)
 * when a recruiter asks for work that belongs to another recruiter.
 */

const SERVER_DIR = fileURLToPath(new URL("../..", import.meta.url));
const PASSWORD = "PermissionTest123";

let server: Server | undefined;
let baseUrl = "";

const fixture = {
  recruiterACookie: "",
  recruiterBCookie: "",
  candidateACookie: "",
  attemptA: "",
  attemptB: "",
  assessmentB: "",
  shortlistB: "",
};

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `sign-in failed for ${email}`);
  const session = res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("sg_session="));
  assert.ok(session, "expected a session cookie");
  return session.split(";")[0];
}

async function get(path: string, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : undefined });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

function errorOf(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : "";
}

/** A published assessment with one task and one criterion, owned by the given recruiter. */
async function createPublishedAssessment(ownerId: string, skillId: string, title: string) {
  const assessment = await prisma.assessment.create({
    data: { ownerId, jobTitle: "Analyst", companyName: "Permission Co" },
  });
  const version = await prisma.assessmentVersion.create({
    data: {
      assessmentId: assessment.id,
      versionNumber: 1,
      status: "PUBLISHED",
      requirementsText: "A junior analyst who can explain delays to a client in writing.",
      title,
      description: "A practical assessment used only by the permission tests.",
      jobContext: "You are joining Permission Co as a junior analyst.",
      candidateInstructions: "Answer the single task. AI assistants are not allowed.",
      targetLevel: "JUNIOR",
      difficulty: "BEGINNER",
      durationMinutes: 20,
      aiPolicy: "NOT_ALLOWED",
      generationMethod: "TEMPLATE",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
  await prisma.assessmentVersionSkill.create({
    data: { versionId: version.id, skillId, weight: 100 },
  });
  const task = await prisma.assessmentTask.create({
    data: {
      versionId: version.id,
      position: 0,
      type: "STRUCTURED_RESPONSE",
      skillId,
      title: "Explain a delayed delivery",
      prompt: "Write a short reply to the client explaining the delay.",
      marks: 100,
      timeMinutes: 20,
      publicData: "{}",
      privateData: JSON.stringify({ answerKey: { days_late: 4242 } }),
    },
  });
  await prisma.assessmentRubricCriterion.create({
    data: {
      taskId: task.id,
      position: 0,
      name: "States the delay clearly",
      description: "Names the delay and apologises for it",
      maxMarks: 100,
      privateGuidance: "Look for the new delivery date",
    },
  });
  return { assessmentId: assessment.id, versionId: version.id };
}

before(async () => {
  // A fresh schema in a temporary file, so the tests never touch the development database.
  execSync("npx prisma migrate deploy", {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: `file:${TEST_DATABASE_FILE}` },
    stdio: "pipe",
  });

  const passwordHash = await hashPassword(PASSWORD);
  const recruiterA = await prisma.user.create({
    data: {
      email: "recruiter.a@permissions.test",
      name: "Recruiter A",
      role: "RECRUITER",
      passwordHash,
    },
  });
  const recruiterB = await prisma.user.create({
    data: {
      email: "recruiter.b@permissions.test",
      name: "Recruiter B",
      role: "RECRUITER",
      passwordHash,
    },
  });
  const candidateA = await prisma.user.create({
    data: {
      email: "candidate.a@permissions.test",
      name: "Candidate A",
      role: "CANDIDATE",
      passwordHash,
    },
  });
  const candidateB = await prisma.user.create({
    data: {
      email: "candidate.b@permissions.test",
      name: "Candidate B",
      role: "CANDIDATE",
      passwordHash,
    },
  });

  const domain = await prisma.skillDomain.create({
    data: {
      slug: "permissions-domain",
      name: "Permissions domain",
      description: "Fixture domain used only by the permission tests",
    },
  });
  const skill = await prisma.skill.create({
    data: {
      slug: "permissions-skill",
      name: "Permissions skill",
      description: "Fixture skill used only by the permission tests",
      assessmentTypes: "STRUCTURED_RESPONSE",
      domainId: domain.id,
    },
  });

  const assessmentA = await createPublishedAssessment(
    recruiterA.id,
    skill.id,
    "Permission test A",
  );
  const assessmentB = await createPublishedAssessment(
    recruiterB.id,
    skill.id,
    "Permission test B",
  );

  const attemptA = await prisma.assessmentAttempt.create({
    data: {
      versionId: assessmentA.versionId,
      candidateId: candidateA.id,
      status: "SUBMITTED",
      submittedAt: new Date("2026-01-02T10:00:00Z"),
    },
  });
  const attemptB = await prisma.assessmentAttempt.create({
    data: {
      versionId: assessmentB.versionId,
      candidateId: candidateB.id,
      status: "SUBMITTED",
      submittedAt: new Date("2026-01-03T10:00:00Z"),
    },
  });
  const shortlistB = await prisma.shortlist.create({
    data: { ownerId: recruiterB.id, name: "Recruiter B list" },
  });

  fixture.attemptA = attemptA.id;
  fixture.attemptB = attemptB.id;
  fixture.assessmentB = assessmentB.assessmentId;
  fixture.shortlistB = shortlistB.id;

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the test server has no port");
  baseUrl = `http://127.0.0.1:${address.port}`;

  fixture.recruiterACookie = await signIn("recruiter.a@permissions.test");
  fixture.recruiterBCookie = await signIn("recruiter.b@permissions.test");
  fixture.candidateACookie = await signIn("candidate.a@permissions.test");
});

after(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      rmSync(`${TEST_DATABASE_FILE}${suffix}`, { force: true });
    } catch {
      /* Windows can still hold the file for a moment; it lives in the temp directory. */
    }
  }
});

describe("signed-out requests", () => {
  it("returns 401 for a recruiter submission read", async () => {
    const res = await get(`/api/recruiter/attempts/${fixture.attemptA}`);
    assert.equal(res.status, 401);
    assert.match(errorOf(res.body), /sign in/i);
  });

  it("returns 401 for candidate routes", async () => {
    assert.equal((await get("/api/candidate/assessments")).status, 401);
    assert.equal((await get("/api/candidate/attempts")).status, 401);
  });

  it("returns 401 for a forged session cookie", async () => {
    const res = await get(
      `/api/recruiter/attempts/${fixture.attemptA}`,
      "sg_session=not-a-real-token",
    );
    assert.equal(res.status, 401);
  });
});

describe("wrong role", () => {
  it("stops a candidate from reading a recruiter submission", async () => {
    const res = await get(
      `/api/recruiter/attempts/${fixture.attemptA}`,
      fixture.candidateACookie,
    );
    assert.equal(res.status, 403);
    assert.match(errorOf(res.body), /permission/i);
  });

  it("stops a candidate from listing shortlists", async () => {
    assert.equal(
      (await get("/api/recruiter/shortlists", fixture.candidateACookie)).status,
      403,
    );
  });

  it("stops a recruiter from opening candidate assessments", async () => {
    const res = await get("/api/candidate/assessments", fixture.recruiterACookie);
    assert.equal(res.status, 403);
  });
});

describe("another recruiter's work", () => {
  it("hides their submission behind 404, not 403", async () => {
    const res = await get(`/api/recruiter/attempts/${fixture.attemptB}`, fixture.recruiterACookie);
    assert.equal(res.status, 404);
    assert.match(errorOf(res.body), /not found/i);
  });

  it("hides their assessment versions behind 404", async () => {
    assert.equal(
      (await get(`/api/recruiter/assessments/${fixture.assessmentB}/versions`, fixture.recruiterACookie))
        .status,
      404,
    );
  });

  it("hides their shortlist behind 404", async () => {
    assert.equal(
      (await get(`/api/recruiter/shortlists/${fixture.shortlistB}`, fixture.recruiterACookie))
        .status,
      404,
    );
  });
});

describe("the owner still has access", () => {
  it("lets the owning recruiter read the submission", async () => {
    const res = await get(`/api/recruiter/attempts/${fixture.attemptA}`, fixture.recruiterACookie);
    assert.equal(res.status, 200);
    const body = res.body as { candidate: { name: string }; score: { possible: number } };
    assert.equal(body.candidate.name, "Candidate A");
    assert.equal(body.score.possible, 100);
  });

  it("lets the candidate read their own attempt without private material", async () => {
    const res = await get(`/api/candidate/attempts/${fixture.attemptA}`, fixture.candidateACookie);
    assert.equal(res.status, 200);
    const json = JSON.stringify(res.body);
    for (const forbidden of ["answerKey", "privateGuidance", "privateData", "4242"]) {
      assert.equal(json.includes(forbidden), false, `${forbidden} must not reach the candidate`);
    }
  });

  it("keeps the candidate out of the other candidate's attempt", async () => {
    assert.equal(
      (await get(`/api/candidate/attempts/${fixture.attemptB}`, fixture.candidateACookie)).status,
      404,
    );
  });
});
