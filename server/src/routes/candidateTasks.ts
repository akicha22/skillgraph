import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { buildDailyTasks, dayKey, shiftDayKey } from "../tasks/practice";
import { gradeDailyAnswer, type DailyQuestionType } from "../tasks/dailyQuestions";
import { awardPoints } from "../tasks/scoring";

/**
 * Daily practice tasks for a candidate.
 *
 * These are private practice, not recruiter assessments. Ten drills are generated from the
 * candidate's own skills the first
 * time they open the page on a given day, then stored so it stays identical for that day.
 */
export const candidateTasksRouter = Router();
candidateTasksRouter.use(requireAuth, requireRole("CANDIDATE"));

function parseSteps(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === "string") : [];
  } catch {
    return [];
  }
}

// Old rows predate exact skill matching. Stamp every newly generated or upgraded key.
const BANK_REVISION = 1;

function isCurrentBank(value: string): boolean {
  try {
    return JSON.parse(value)?.bankRevision === BANK_REVISION;
  } catch {
    return false;
  }
}

type AnswerKey = { type: DailyQuestionType; accepted: string[]; explanation: string };

function parseAnswerKey(value: string): AnswerKey {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const accepted = Array.isArray(record.accepted)
        ? record.accepted.filter((row): row is string => typeof row === "string")
        : [];
      return {
        type: record.type === "SHORT_TEXT" || record.type === "SELF_REVIEW" ? record.type : "NUMBER",
        accepted,
        explanation: typeof record.explanation === "string" ? record.explanation : "",
      };
    }
  } catch {
    // A malformed key must never break the page; it simply grades nothing.
  }
  return { type: "NUMBER", accepted: [], explanation: "" };
}

function serializeTask(task: {
  id: string;
  position: number;
  title: string;
  scenario: string;
  steps: string;
  estimateMinutes: number;
  difficulty: string;
  question: string;
  answerKey: string;
  answer: string;
  attempts: number;
  result: string | null;
  solved: boolean;
  points: number;
  earnedPoints: number;
  status: string;
  reflection: string;
  completedAt: Date | null;
  skill: { name: string };
}) {
  const key = parseAnswerKey(task.answerKey);
  // Review criteria unlock on submission; objective keys unlock only on a correct answer.
  const revealed = task.solved || (key.type === "SELF_REVIEW" && task.attempts > 0);

  return {
    id: task.id,
    position: task.position,
    title: task.title,
    skillName: task.skill.name,
    scenario: task.scenario,
    steps: parseSteps(task.steps),
    estimateMinutes: task.estimateMinutes,
    difficulty: task.difficulty,
    question: task.question,
    selfReview: key.type === "SELF_REVIEW",
    points: task.points,
    earnedPoints: task.earnedPoints,
    attempts: task.attempts,
    answer: task.answer,
    result: task.result,
    solved: task.solved,
    explanation: revealed ? key.explanation : null,
    expectedAnswer: revealed ? (key.accepted[0] ?? null) : null,
    status: task.status,
    reflection: task.reflection,
    completedAt: task.completedAt,
  };
}

/** Consecutive days with at least one completed drill, ending today or yesterday. */
function streakFrom(dayKeys: string[], today: string): number {
  const done = new Set(dayKeys);
  let cursor = done.has(today) ? today : shiftDayKey(today, -1);
  let streak = 0;
  while (done.has(cursor) && streak < 365) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

async function tasksForDay(candidateId: string, day: string) {
  return prisma.dailyTask.findMany({
    where: { candidateId, day },
    orderBy: { position: "asc" },
    include: { skill: { select: { id: true, slug: true, name: true } } },
  });
}

candidateTasksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const candidateId = currentUser(res).id;
    const today = dayKey();

    let tasks = await tasksForDay(candidateId, today);
    let needsSkills = false;
    let needsSupportedSkills = false;

    const isUntouchedLegacy = (task: (typeof tasks)[number]) =>
      task.status === "PENDING" && task.attempts === 0 && !task.solved &&
      (task.question.length === 0 || !isCurrentBank(task.answerKey));

    if (tasks.length === 0 || tasks.some(isUntouchedLegacy)) {
      const skills = await prisma.candidateSkill.findMany({
        where: { userId: candidateId },
        orderBy: [{ createdAt: "asc" }, { skillId: "asc" }],
        select: { skill: { select: { id: true, slug: true, name: true } } },
      });
      const plans = buildDailyTasks({ candidateId, dateKey: today, skills: skills.map((row) => row.skill) });
      const existing = new Map(tasks.map((task) => [task.position, task]));
      const writes = plans.flatMap<Prisma.PrismaPromise<unknown>>((plan) => {
        const task = existing.get(plan.position);
        if (task && !isUntouchedLegacy(task)) return [];
        const data = {
          skillId: plan.skillId, family: plan.family, title: plan.title, scenario: plan.scenario,
          steps: JSON.stringify(plan.steps), estimateMinutes: plan.minutes, difficulty: plan.difficulty,
          question: plan.question, points: plan.points,
          answerKey: JSON.stringify({
            bankRevision: BANK_REVISION, type: plan.questionType,
            accepted: plan.acceptedAnswers, explanation: plan.explanation,
          }),
        };
        if (task) {
          // Compare the old key and attempt state so a concurrent submission or refresh wins safely.
          return [prisma.dailyTask.updateMany({
            where: { id: task.id, status: "PENDING", attempts: 0, solved: false, answerKey: task.answerKey },
            data,
          })];
        }
        return [prisma.dailyTask.upsert({
          where: { candidateId_day_position: { candidateId, day: today, position: plan.position } },
          update: {},
          create: { ...data, candidateId, day: today, position: plan.position },
        })];
      });
      if (writes.length > 0) await prisma.$transaction(writes);
      tasks = (await tasksForDay(candidateId, today)).filter((task) => !isUntouchedLegacy(task));
      needsSkills = tasks.length === 0 && skills.length === 0;
      needsSupportedSkills = tasks.length === 0 && skills.length > 0;
    }

    const since = shiftDayKey(today, -6);
    const week = await prisma.dailyTask.findMany({
      where: { candidateId, day: { gte: since } },
      select: { day: true, status: true },
    });
    const recent = await prisma.dailyTask.findMany({
      where: { candidateId, status: "DONE", day: { gte: shiftDayKey(today, -60) } },
      select: { day: true },
      distinct: ["day"],
    });

    const byDay = new Map<string, { total: number; done: number }>();
    for (const row of week) {
      const entry = byDay.get(row.day) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (row.status === "DONE") entry.done += 1;
      byDay.set(row.day, entry);
    }
    const last7 = Array.from({ length: 7 }, (_, index) => {
      const day = shiftDayKey(today, index - 6);
      const entry = byDay.get(day) ?? { total: 0, done: 0 };
      return { day, ...entry };
    });

    const doneToday = tasks.filter((task) => task.status === "DONE").length;
    const earned = await prisma.dailyTask.aggregate({
      where: { candidateId, solved: true },
      _sum: { earnedPoints: true },
      _count: { _all: true },
    });

    res.json({
      day: today,
      needsSkills,
      needsSupportedSkills,
      tasks: tasks.map(serializeTask),
      summary: {
        todayTotal: tasks.length,
        todayDone: doneToday,
        todayPoints: tasks.reduce((sum, task) => sum + task.earnedPoints, 0),
        totalPoints: earned._sum.earnedPoints ?? 0,
        tasksSolved: earned._count._all,
        streakDays: streakFrom(
          recent.map((row) => row.day),
          today,
        ),
        last7,
      },
    });
  }),
);

const answerSchema = z
  .object({
    answer: z
      .string()
      .trim()
      .min(1, "Write an answer first")
      .max(500, "Keep your answer under 500 characters"),
  })
  .strict();

// Checkable answers earn points; practical submissions unlock criteria but are not graded.
candidateTasksRouter.post(
  "/:taskId/answer",
  asyncHandler(async (req, res) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid answer", details: formatZodIssues(parsed.error) });
      return;
    }

    const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
    const candidateId = currentUser(res).id;
    const task = await prisma.dailyTask.findFirst({
      where: { id: taskId, candidateId },
      include: { skill: { select: { name: true } } },
    });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const key = parseAnswerKey(task.answerKey);

    if (task.status === "DONE") {
      res.json({
        task: serializeTask(task),
        feedback: {
          correct: task.solved,
          awarded: 0,
          attempts: task.attempts,
          explanation: key.explanation,
          expectedAnswer: key.accepted[0] ?? null,
          alreadySolved: true,
        },
      });
      return;
    }

    if (task.day === dayKey() && task.attempts === 0 && (!task.question || !isCurrentBank(task.answerKey))) {
      res.status(409).json({ error: "This practice question is out of date. Reload Daily tasks for the current question." });
      return;
    }

    const submitted = parsed.data.answer;
    const selfReview = key.type === "SELF_REVIEW";
    const correct = gradeDailyAnswer(key.type, key.accepted, submitted);
    const awarded = correct ? awardPoints(task.points, task.attempts) : 0;

    const write = await prisma.dailyTask.updateMany({
      where: { id: task.id, status: "PENDING", attempts: task.attempts, answerKey: task.answerKey },
      data: {
        answer: submitted,
        attempts: { increment: 1 },
        result: selfReview ? null : correct ? "CORRECT" : "INCORRECT",
        solved: correct,
        earnedPoints: awarded,
        status: correct || selfReview ? "DONE" : "PENDING",
        completedAt: correct || selfReview ? new Date() : null,
      },
    });

    if (write.count === 0) {
      res.status(409).json({ error: "This task changed in another tab. Refresh before trying again." });
      return;
    }
    const updated = await prisma.dailyTask.findUniqueOrThrow({
      where: { id: task.id }, include: { skill: { select: { name: true } } },
    });

    res.json({
      task: serializeTask(updated),
      feedback: {
        correct,
        awarded,
        attempts: updated.attempts,
        explanation: correct || selfReview ? key.explanation : "Recheck the details and the requested answer format.",
        expectedAnswer: correct ? key.accepted[0] ?? null : null,
        alreadySolved: false,
      },
    });
  }),
);

const noteSchema = z
  .object({
    reflection: z.string().trim().max(1000, "Keep your note under 1000 characters"),
  })
  .strict();

// The private note is the only thing the candidate can still edit after solving a drill.
candidateTasksRouter.put(
  "/:taskId",
  asyncHandler(async (req, res) => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid note", details: formatZodIssues(parsed.error) });
      return;
    }

    const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
    const task = await prisma.dailyTask.findFirst({
      where: { id: taskId, candidateId: currentUser(res).id },
      select: { id: true },
    });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const updated = await prisma.dailyTask.update({
      where: { id: task.id },
      data: { reflection: parsed.data.reflection },
      include: { skill: { select: { name: true } } },
    });

    res.json({ task: serializeTask(updated) });
  }),
);
