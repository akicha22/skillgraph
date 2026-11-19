import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { buildDailyTasks, dayKey, shiftDayKey } from "../tasks/practice";

/**
 * Daily practice tasks for a candidate.
 *
 * These are preparation, not evaluation: no marks, no rubric, no attempt record and nothing a
 * recruiter can read. A set of three drills is generated from the candidate's own skills the first
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

function serializeTask(task: {
  id: string;
  position: number;
  family: string;
  title: string;
  scenario: string;
  steps: string;
  estimateMinutes: number;
  status: string;
  reflection: string;
  completedAt: Date | null;
  skill: { name: string };
}) {
  return {
    id: task.id,
    position: task.position,
    family: task.family,
    title: task.title,
    skillName: task.skill.name,
    scenario: task.scenario,
    steps: parseSteps(task.steps),
    estimateMinutes: task.estimateMinutes,
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
              },
            }),
          ),
        );
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

    const doneToday = tasks.filter((task) => task.status === "DONE").length;

    res.json({
      day: today,
      needsSkills,
      tasks: tasks.map(serializeTask),
      summary: {
        todayTotal: tasks.length,
        todayDone: doneToday,
        streakDays: streakFrom(
          recent.map((row) => row.day),
          today,
        ),
        last7,
      },
    });
  }),
);

const completeSchema = z
  .object({
    done: z.boolean(),
    reflection: z
      .string()
      .trim()
      .max(1000, "Keep your note under 1000 characters")
      .optional(),
  })
  .strict();

// Marks a drill done (with an optional one-line note) or reopens it. Only the candidate's own task.
candidateTasksRouter.put(
  "/:taskId",
  asyncHandler(async (req, res) => {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid update", details: formatZodIssues(parsed.error) });
      return;
    }

    const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
    const candidateId = currentUser(res).id;
    const task = await prisma.dailyTask.findFirst({
      where: { id: taskId, candidateId },
      select: { id: true, reflection: true },
    });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const updated = await prisma.dailyTask.update({
      where: { id: task.id },
      data: {
        status: parsed.data.done ? "DONE" : "PENDING",
        completedAt: parsed.data.done ? new Date() : null,
        reflection: parsed.data.reflection ?? task.reflection,
      },
      include: { skill: { select: { name: true } } },
    });

    res.json({ task: serializeTask(updated) });
  }),
);
