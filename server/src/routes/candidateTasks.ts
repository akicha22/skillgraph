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
 * These are preparation, not evaluation: no marks, no rubric, no attempt record and nothing a
 * recruiter can read. A set of ten drills is generated from the candidate's own skills the first
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
        type: record.type === "SHORT_TEXT" ? "SHORT_TEXT" : "NUMBER",
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
  // The expected answer and explanation unlock only after a submission, never before.
  const revealed = task.attempts > 0;

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
    include: { skill: { select: { name: true } } },
  });
}

candidateTasksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const candidateId = currentUser(res).id;
    const today = dayKey();

    let tasks = await tasksForDay(candidateId, today);
    let needsSkills = false;

    if (tasks.length === 0) {
      const skills = await prisma.candidateSkill.findMany({
        where: { userId: candidateId },
        orderBy: { createdAt: "asc" },
        select: { skill: { select: { id: true, slug: true, name: true } } },
      });
      const plans = buildDailyTasks({
        candidateId,
        dateKey: today,
        skills: skills.map((row) => row.skill),
      });
      needsSkills = plans.length === 0;

      if (plans.length > 0) {
        // Upserts on (candidate, day, position): two open tabs on the same day cannot duplicate a
        // set, and SQLite does not support createMany's skipDuplicates option.
        await prisma.$transaction(
          plans.map((plan) =>
            prisma.dailyTask.upsert({
              where: {
                candidateId_day_position: {
                  candidateId,
                  day: today,
                  position: plan.position,
                },
              },
              update: {},
              create: {
                candidateId,
                skillId: plan.skillId,
                day: today,
                position: plan.position,
                family: plan.family,
                title: plan.title,
                scenario: plan.scenario,
                steps: JSON.stringify(plan.steps),
                estimateMinutes: plan.minutes,
                difficulty: plan.difficulty,
                question: plan.question,
                answerKey: JSON.stringify({
                  type: plan.questionType,
                  accepted: plan.acceptedAnswers,
                  explanation: plan.explanation,
                }),
                points: plan.points,
              },
            }),
          ),
        );
        tasks = await tasksForDay(candidateId, today);
      }
    }

    // Rows created before the graded-question fields existed have no question. A repeated question
    // can also survive from an older generator. Both are repaired from the current plan, but never
    // on a drill the candidate has already attempted.
    const repeatedQuestions = new Set(
      tasks
        .map((task) => task.question)
        .filter((question, index, all) => question !== "" && all.indexOf(question) !== index),
    );
    if (
      tasks.length > 0 &&
      (tasks.some((task) => !task.question) || repeatedQuestions.size > 0)
    ) {
      const skills = await prisma.candidateSkill.findMany({
        where: { userId: candidateId },
        orderBy: { createdAt: "asc" },
        select: { skill: { select: { id: true, slug: true, name: true } } },
      });
      const plans = buildDailyTasks({
        candidateId,
        dateKey: today,
        skills: skills.map((row) => row.skill),
      });
      const updates = tasks.flatMap((task) => {
        const plan = plans.find((row) => row.position === task.position);
        if (!plan) return [];
        const missing = !task.question;
        const repeated = repeatedQuestions.has(task.question);
        if (!missing && !repeated) return [];
        if (!missing && (task.solved || task.attempts > 0)) return [];
        return [
          prisma.dailyTask.update({
            where: { id: task.id },
            data: {
              steps: JSON.stringify(plan.steps),
              difficulty: plan.difficulty,
              question: plan.question,
              points: plan.points,
              // Tasks completed before grading existed cannot satisfy the new rule.
              status: "PENDING",
              completedAt: null,
              answerKey: JSON.stringify({
                type: plan.questionType,
                accepted: plan.acceptedAnswers,
                explanation: plan.explanation,
              }),
            },
          }),
        ];
      });
      if (updates.length > 0) {
        await prisma.$transaction(updates);
        tasks = await tasksForDay(candidateId, today);
      }
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

    const doneToday = tasks.filter((task) => task.solved).length;
    const earned = await prisma.dailyTask.aggregate({
      where: { candidateId, solved: true },
      _sum: { earnedPoints: true },
      _count: { _all: true },
    });

    res.json({
      day: today,
      needsSkills,
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

// Grading happens here, on the server, against the stored private key. A task is only completed
// by a correct answer: full points on the first attempt, half (rounded down) after any wrong
// attempt, and nothing for a wrong answer. Re-submitting a solved task never pays again.
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

    if (task.solved) {
      res.json({
        task: serializeTask(task),
        feedback: {
          correct: true,
          awarded: 0,
          attempts: task.attempts,
          explanation: key.explanation,
          expectedAnswer: key.accepted[0] ?? null,
          alreadySolved: true,
        },
      });
      return;
    }

    const submitted = parsed.data.answer;
    const correct = gradeDailyAnswer(key.type, key.accepted, submitted);
    const awarded = correct ? awardPoints(task.points, task.attempts) : 0;

    const updated = await prisma.dailyTask.update({
      where: { id: task.id },
      data: {
        answer: submitted,
        attempts: { increment: 1 },
        result: correct ? "CORRECT" : "INCORRECT",
        solved: correct,
        earnedPoints: awarded,
        status: correct ? "DONE" : "PENDING",
        completedAt: correct ? new Date() : null,
      },
      include: { skill: { select: { name: true } } },
    });

    res.json({
      task: serializeTask(updated),
      feedback: {
        correct,
        awarded,
        attempts: updated.attempts,
        explanation: key.explanation,
        expectedAnswer: key.accepted[0] ?? null,
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
