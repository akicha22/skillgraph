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
const CANDIDATE_D_EMAIL = "candidate.d@permissions.test";

let server: Server | undefined;
let baseUrl = "";

const fixture = {
  recruiterACookie: "",
  recruiterBCookie: "",
  candidateACookie: "",
  candidateBCookie: "",
  candidateCCookie: "",
  candidateDCookie: "",
  candidateAId: "",
  candidateBId: "",
  candidateCId: "",
  attemptA: "",
  attemptB: "",
  versionA: "",
  versionB: "",
  versionC: "",
  assessmentB: "",
  shortlistB: "",
  skillId: "",
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

async function put(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
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
  const candidateC = await prisma.user.create({
    data: {
      email: "candidate.c@permissions.test",
      name: "Candidate C",
      role: "CANDIDATE",
      passwordHash,
    },
  });
  const candidateD = await prisma.user.create({
    data: {
      email: CANDIDATE_D_EMAIL,
      name: "Candidate D",
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
  const assessmentC = await createPublishedAssessment(
    recruiterA.id,
    skill.id,
    "Permission test C",
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

  fixture.candidateAId = candidateA.id;
  fixture.candidateBId = candidateB.id;
  fixture.candidateCId = candidateC.id;
  fixture.skillId = skill.id;
  fixture.attemptA = attemptA.id;
  fixture.attemptB = attemptB.id;
  fixture.versionA = assessmentA.versionId;
  fixture.versionB = assessmentB.versionId;
  fixture.versionC = assessmentC.versionId;
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
  fixture.candidateBCookie = await signIn("candidate.b@permissions.test");
  fixture.candidateCCookie = await signIn("candidate.c@permissions.test");
  fixture.candidateDCookie = await signIn(CANDIDATE_D_EMAIL);
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

describe("saved comparison weights", () => {
  it("saves and returns the owner's weighting", async () => {
    const skills = await prisma.assessmentVersionSkill.findMany({
      where: { versionId: fixture.versionA },
      select: { skillId: true },
    });
    const saved = await put(
      "/api/recruiter/attempts/compare/weights",
      fixture.recruiterACookie,
      {
        versionId: fixture.versionA,
        weights: skills.map((skill) => ({ skillId: skill.skillId, weight: 50 })),
      },
    );
    assert.equal(saved.status, 200);

    const read = await get(
      `/api/recruiter/attempts/compare/weights?versionId=${fixture.versionA}`,
      fixture.recruiterACookie,
    );
    assert.equal(read.status, 200);
    const body = read.body as { weights: { skillId: string; weight: number }[] | null };
    assert.equal(body.weights?.length, skills.length);
    assert.equal(body.weights?.[0].weight, 50);
  });

  it("rejects a skill that is not in the version", async () => {
    const res = await put(
      "/api/recruiter/attempts/compare/weights",
      fixture.recruiterACookie,
      { versionId: fixture.versionA, weights: [{ skillId: "not-a-skill", weight: 10 }] },
    );
    assert.equal(res.status, 400);
  });

  it("stops a candidate from saving weights", async () => {
    const res = await put(
      "/api/recruiter/attempts/compare/weights",
      fixture.candidateACookie,
      { versionId: fixture.versionA, weights: [] },
    );
    assert.equal(res.status, 403);
  });

  it("hides another recruiter's weighting behind 404", async () => {
    const res = await get(
      `/api/recruiter/attempts/compare/weights?versionId=${fixture.versionB}`,
      fixture.recruiterACookie,
    );
    assert.equal(res.status, 404);
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

describe("interview follow-ups", () => {
  async function criterionOfVersionA() {
    const criterion = await prisma.assessmentRubricCriterion.findFirst({
      where: { task: { versionId: fixture.versionA } },
      select: { id: true },
    });
    assert.ok(criterion, "the fixture assessment needs a criterion");
    return criterion;
  }

  it("is candidate-only", async () => {
    assert.equal((await get(`/api/candidate/attempts/${fixture.attemptA}/follow-ups`)).status, 401);
    assert.equal(
      (
        await get(
          `/api/candidate/attempts/${fixture.attemptA}/follow-ups`,
          fixture.recruiterACookie,
        )
      ).status,
      403,
    );
  });

  it("gives the candidate one question taken from the rubric", async () => {
    const res = await get(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups`,
      fixture.candidateACookie,
    );
    assert.equal(res.status, 200);
    const body = res.body as {
      total: number;
      answeredCount: number;
      questions: { criterion: string; answer: string }[];
    };
    assert.equal(body.total, 1);
    assert.equal(body.answeredCount, 0);
    assert.equal(body.questions[0].criterion, "States the delay clearly");
    assert.equal(body.questions[0].answer, "");
  });

  it("hides another candidate's questions behind 404", async () => {
    const read = await get(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups`,
      fixture.candidateBCookie,
    );
    assert.equal(read.status, 404);
    const write = await put(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups/anything`,
      fixture.candidateBCookie,
      { answer: "not mine" },
    );
    assert.equal(write.status, 404);
  });

  it("rejects a criterion from outside this assessment", async () => {
    const res = await put(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups/not-a-criterion`,
      fixture.candidateACookie,
      { answer: "x" },
    );
    assert.equal(res.status, 404);
  });

  it("stays closed until the attempt is submitted", async () => {
    await prisma.assessmentAttempt.update({
      where: { id: fixture.attemptB },
      data: { status: "IN_PROGRESS", submittedAt: null },
    });
    try {
      const res = await get(
        `/api/candidate/attempts/${fixture.attemptB}/follow-ups`,
        fixture.candidateBCookie,
      );
      assert.equal(res.status, 409);
    } finally {
      await prisma.assessmentAttempt.update({
        where: { id: fixture.attemptB },
        data: { status: "SUBMITTED", submittedAt: new Date("2026-01-03T10:00:00Z") },
      });
    }
  });

  it("saves the answer and shows it to the recruiter", async () => {
    const criterion = await criterionOfVersionA();
    const answer = "I would name the delay, give the new date and offer a partial delivery.";
    const saved = await put(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups/${criterion.id}`,
      fixture.candidateACookie,
      { answer },
    );
    assert.equal(saved.status, 200);
    assert.equal((saved.body as { answer: string }).answer, answer);

    const own = await get(
      `/api/candidate/attempts/${fixture.attemptA}/follow-ups`,
      fixture.candidateACookie,
    );
    const stated = own.body as { answeredCount: number; questions: { answer: string }[] };
    assert.equal(stated.answeredCount, 1);
    assert.equal(stated.questions[0].answer, answer);

    const submission = await get(
      `/api/recruiter/attempts/${fixture.attemptA}`,
      fixture.recruiterACookie,
    );
    assert.equal(submission.status, 200);
    const followUps = (
      submission.body as {
        followUpQuestions: { criterionId: string; candidateAnswer: string | null }[];
      }
    ).followUpQuestions;
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].criterionId, criterion.id);
    assert.equal(followUps[0].candidateAnswer, answer);
  });
});

describe("candidate consent", () => {
  it("blocks a new attempt until consent and still resumes an existing one", async () => {
    const blocked = await post("/api/candidate/attempts", fixture.candidateCCookie, {
      versionId: fixture.versionC,
    });
    assert.equal(blocked.status, 403);
    assert.match(errorOf(blocked.body), /consent/i);

    const consent = await post("/api/candidate/profile/consent", fixture.candidateCCookie, {
      version: "v1",
    });
    assert.equal(consent.status, 200);

    const profile = await get("/api/candidate/profile", fixture.candidateCCookie);
    const profileBody = profile.body as {
      profile: { consentVersion: string | null; consentAt: string | null };
    };
    assert.equal(profileBody.profile.consentVersion, "v1");
    assert.ok(profileBody.profile.consentAt);

    const started = await post("/api/candidate/attempts", fixture.candidateCCookie, {
      versionId: fixture.versionC,
    });
    assert.equal(started.status, 200);

    // Consent is only required for a new attempt, not for reopening an existing one.
    await prisma.user.update({
      where: { id: fixture.candidateCId },
      data: { consentAt: null },
    });
    const resumed = await post("/api/candidate/attempts", fixture.candidateCCookie, {
      versionId: fixture.versionC,
    });
    assert.equal(resumed.status, 200);
  });
});

describe("leaderboard opt-in", () => {
  it("hides a non-opted-in candidate from entries but keeps their own totals", async () => {
    await prisma.user.update({
      where: { id: fixture.candidateAId },
      data: { leaderboardOptIn: false },
    });
    await prisma.user.update({
      where: { id: fixture.candidateBId },
      data: { leaderboardOptIn: true },
    });
    await prisma.dailyTask.createMany({
      data: [
        {
          candidateId: fixture.candidateAId,
          skillId: fixture.skillId,
          day: "2026-11-20",
          position: 1,
          family: "GENERAL",
          title: "Leaderboard fixture A",
          scenario: "A short practice scenario.",
          steps: JSON.stringify(["one", "two", "three"]),
          estimateMinutes: 5,
          difficulty: "BEGINNER",
          question: "Fixture question?",
          answerKey: JSON.stringify({ type: "SHORT_TEXT", accepted: ["fixture"] }),
          points: 5,
          earnedPoints: 5,
          solved: true,
          status: "DONE",
        },
        {
          candidateId: fixture.candidateBId,
          skillId: fixture.skillId,
          day: "2026-11-20",
          position: 1,
          family: "GENERAL",
          title: "Leaderboard fixture B",
          scenario: "A short practice scenario.",
          steps: JSON.stringify(["one", "two", "three"]),
          estimateMinutes: 5,
          difficulty: "BEGINNER",
          question: "Fixture question?",
          answerKey: JSON.stringify({ type: "SHORT_TEXT", accepted: ["fixture"] }),
          points: 10,
          earnedPoints: 10,
          solved: true,
          status: "DONE",
        },
      ],
    });

    const hidden = await get("/api/leaderboard", fixture.candidateACookie);
    assert.equal(hidden.status, 200);
    const hiddenBody = hidden.body as {
      entries: { name: string }[];
      me: { rank: number | null; points: number; tasksSolved: number };
    };
    assert.equal(
      hiddenBody.entries.some((entry) => entry.name === "Candidate A"),
      false,
    );
    assert.equal(hiddenBody.me.rank, null);
    assert.equal(hiddenBody.me.points, 5);
    assert.equal(hiddenBody.me.tasksSolved, 1);

    const visible = await get("/api/leaderboard", fixture.candidateBCookie);
    assert.equal(visible.status, 200);
    const visibleBody = visible.body as {
      entries: { name: string }[];
      me: { rank: number | null; points: number };
    };
    assert.equal(
      visibleBody.entries.some((entry) => entry.name === "Candidate B"),
      true,
    );
    assert.equal(typeof visibleBody.me.rank, "number");
    assert.equal(visibleBody.me.points, 10);
  });
});

describe("account deletion", () => {
  it("keeps the account when the password is wrong", async () => {
    const denied = await del("/api/candidate/profile", fixture.candidateDCookie, {
      password: "WrongPassword123",
    });
    assert.equal(denied.status, 401);
    assert.match(errorOf(denied.body), /password/i);
    assert.equal((await get("/api/candidate/profile", fixture.candidateDCookie)).status, 200);
  });

  it("deletes the account with the right password and rejects the next login", async () => {
    const deleted = await del("/api/candidate/profile", fixture.candidateDCookie, {
      password: PASSWORD,
    });
    assert.equal(deleted.status, 204);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: CANDIDATE_D_EMAIL, password: PASSWORD }),
    });
    assert.equal(login.status, 401);
  });

  it("does not let a recruiter delete a candidate profile", async () => {
    const res = await del("/api/candidate/profile", fixture.recruiterACookie, {
      password: PASSWORD,
    });
    assert.equal(res.status, 403);
  });
});
