import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";

/**
 * End-to-end daily-practice tests. They run the real Express app against a throwaway SQLite file
 * in the OS temp directory, so grading, retries, point caps and the leaderboard are exercised over
 * HTTP rather than by calling helpers directly.
 */

const SERVER_DIR = fileURLToPath(new URL("../..", import.meta.url));
const DB_FILE = path.join(os.tmpdir(), `skillgraph-daily-${process.pid}.db`);
const PASSWORD = "DailyTaskTest123";

// Must be set before the app and Prisma client load.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `file:${DB_FILE}`;
process.env.JWT_SECRET = "daily-task-test-secret-not-used-in-app";
process.env.AI_PROVIDER = "template";

const { app } = await import("../app.js");
const { prisma } = await import("../db.js");
const { hashPassword } = await import("../auth/password.js");
const { dayKey } = await import("../tasks/practice.js");

let server: Server | undefined;
let baseUrl = "";
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `sign-in failed for ${email}`);
  const session = res.headers.getSetCookie().find((cookie) => cookie.startsWith("sg_session="));
  assert.ok(session, "expected a session cookie");
  return session.split(";")[0];
}

async function get(path: string, cookie: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
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

before(async () => {
  execSync("npx prisma migrate deploy", {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: "pipe",
  });

  const passwordHash = await hashPassword(PASSWORD);
  const domain = await prisma.skillDomain.create({
    data: { slug: "daily-test-domain", name: "Daily test domain", description: "Fixture" },
  });
  const skill = await prisma.skill.create({
    data: {
      slug: "sales",
      name: "Sales",
      description: "Fixture sales skill",
      assessmentTypes: "STRUCTURED_RESPONSE",
      domainId: domain.id,
    },
  });

  for (const [key, email, name, role] of [
    ["candidateA", "daily.a@test.local", "Candidate A", "CANDIDATE"],
    ["candidateB", "daily.b@test.local", "Candidate B", "CANDIDATE"],
    ["recruiter", "daily.r@test.local", "Recruiter R", "RECRUITER"],
  ] as const) {
    const user = await prisma.user.create({
      data: { email, name, role, passwordHash },
    });
    ids[key] = user.id;
  }

  for (const key of ["candidateA", "candidateB"] as const) {
    await prisma.candidateSkill.create({
      data: { userId: ids[key], skillId: skill.id },
    });
  }
  ids.skill = skill.id;

  // Candidate B has already earned 15 points, so the ranking has something to order.
  await prisma.dailyTask.create({
    data: {
      candidateId: ids.candidateB,
      skillId: skill.id,
      day: dayKey(),
      position: 9,
      family: "SALES",
      title: "Sales: advanced drill",
      scenario: "A fixture scenario.",
      steps: "[]",
      estimateMinutes: 12,
      difficulty: "ADVANCED",
      question: "What is 10 + 5?",
      answerKey: JSON.stringify({ type: "NUMBER", accepted: ["15"], explanation: "15." }),
      answer: "15",
      attempts: 1,
      result: "CORRECT",
      solved: true,
      points: 15,
      earnedPoints: 15,
      status: "DONE",
      completedAt: new Date(),
    },
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the test server has no port");
  baseUrl = `http://127.0.0.1:${address.port}`;

  cookies.candidateA = await signIn("daily.a@test.local");
  cookies.candidateB = await signIn("daily.b@test.local");
  cookies.recruiter = await signIn("daily.r@test.local");
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
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      /* Windows can still hold the file for a moment; it lives in the temp directory. */
    }
  }
});

describe("daily task progression and grading", () => {
  it("returns ten drills in rising difficulty with the answer key hidden", async () => {
    const res = await get("/api/candidate/tasks", cookies.candidateA);
    assert.equal(res.status, 200);
    const body = res.body as {
      tasks: {
        id: string;
        difficulty: string;
        points: number;
        question: string;
        expectedAnswer: string | null;
        explanation: string | null;
        solved: boolean;
      }[];
    };

    assert.equal(body.tasks.length, 10);
    assert.deepEqual(
      body.tasks.map((task) => task.difficulty),
      [
        "BEGINNER",
        "BEGINNER",
        "BEGINNER",
        "INTERMEDIATE",
        "INTERMEDIATE",
        "INTERMEDIATE",
        "INTERMEDIATE",
        "ADVANCED",
        "ADVANCED",
        "ADVANCED",
      ],
    );
    assert.deepEqual(
      body.tasks.map((task) => task.points),
      [5, 5, 5, 10, 10, 10, 10, 15, 15, 15],
    );
    for (const task of body.tasks) {
      assert.ok(task.question.length > 0);
      assert.equal(task.expectedAnswer, null);
      assert.equal(task.explanation, null);
      assert.equal(task.solved, false);
    }
    ids.firstTask = body.tasks[0].id;
  });

  it("awards nothing for a wrong answer and keeps the task open", async () => {
    const res = await post(`/api/candidate/tasks/${ids.firstTask}/answer`, cookies.candidateA, {
      answer: "definitely not the answer",
    });
    assert.equal(res.status, 200);
    const body = res.body as {
      feedback: { correct: boolean; awarded: number; attempts: number };
      task: { solved: boolean; earnedPoints: number; status: string; explanation: string | null };
    };
    assert.equal(body.feedback.correct, false);
    assert.equal(body.feedback.awarded, 0);
    assert.equal(body.feedback.attempts, 1);
    assert.equal(body.task.solved, false);
    assert.equal(body.task.earnedPoints, 0);
    assert.equal(body.task.status, "PENDING");
    assert.ok(body.task.explanation, "the explanation is revealed after a submission");
  });

  it("completes on a correct retry for half points and never pays twice", async () => {
    const stored = await prisma.dailyTask.findUniqueOrThrow({
      where: { id: ids.firstTask },
      select: { answerKey: true, points: true },
    });
    const key = JSON.parse(stored.answerKey) as { accepted: string[] };

    const correct = await post(
      `/api/candidate/tasks/${ids.firstTask}/answer`,
      cookies.candidateA,
      { answer: ` ${key.accepted[0]} ` },
    );
    assert.equal(correct.status, 200);
    const body = correct.body as {
      feedback: { correct: boolean; awarded: number; attempts: number };
      task: { solved: boolean; earnedPoints: number; status: string };
    };
    assert.equal(body.feedback.correct, true);
    assert.equal(body.feedback.awarded, Math.floor(stored.points / 2));
    assert.equal(body.feedback.attempts, 2);
    assert.equal(body.task.solved, true);
    assert.equal(body.task.earnedPoints, Math.floor(stored.points / 2));
    assert.equal(body.task.status, "DONE");

    const again = await post(
      `/api/candidate/tasks/${ids.firstTask}/answer`,
      cookies.candidateA,
      { answer: key.accepted[0] },
    );
    assert.equal(again.status, 200);
    const repeat = again.body as {
      feedback: { awarded: number; alreadySolved: boolean };
      task: { earnedPoints: number };
    };
    assert.equal(repeat.feedback.awarded, 0);
    assert.equal(repeat.feedback.alreadySolved, true);
    assert.equal(repeat.task.earnedPoints, Math.floor(stored.points / 2));

    const persisted = await prisma.dailyTask.findUniqueOrThrow({
      where: { id: ids.firstTask },
      select: { attempts: true, earnedPoints: true, solved: true },
    });
    assert.equal(persisted.attempts, 2);
    assert.equal(persisted.earnedPoints, Math.floor(stored.points / 2));
    assert.equal(persisted.solved, true);
  });

  it("does not let another candidate answer someone else's task", async () => {
    const res = await post(`/api/candidate/tasks/${ids.firstTask}/answer`, cookies.candidateB, {
      answer: "15",
    });
    assert.equal(res.status, 404);
  });
});

describe("leaderboard", () => {
  it("ranks candidates by total points for a candidate", async () => {
    const res = await get("/api/leaderboard", cookies.candidateA);
    assert.equal(res.status, 200);
    const body = res.body as {
      entries: { name: string; points: number; rank: number; isMe: boolean }[];
      me: { rank: number | null; points: number };
    };

    // Candidate A earned 2 points on a retry; Candidate B already had 15.
    assert.deepEqual(
      body.entries.map((entry) => [entry.name, entry.points, entry.rank]),
      [
        ["Candidate B", 15, 1],
        ["Candidate A", 2, 2],
      ],
    );
    assert.equal(body.entries[1].isMe, true);
    assert.equal(body.me.rank, 2);
    assert.equal(body.me.points, 2);
  });

  it("shows the same rankings to a recruiter, without candidate answers", async () => {
    const res = await get("/api/leaderboard", cookies.recruiter);
    assert.equal(res.status, 200);
    const body = res.body as {
      entries: { name: string; points: number; rank: number }[];
    };
    assert.deepEqual(
      body.entries.map((entry) => [entry.name, entry.points, entry.rank]),
      [
        ["Candidate B", 15, 1],
        ["Candidate A", 2, 2],
      ],
    );
    assert.doesNotMatch(JSON.stringify(body), /answer|explanation|email/i);
  });
});
