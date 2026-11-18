import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const candidateAttemptsRouter = Router();
candidateAttemptsRouter.use(requireAuth, requireRole("CANDIDATE"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const MAX_ANSWER_CHARS = 20000;

const startSchema = z.object({ versionId: z.string().min(1, "Choose an assessment") });
const answerSchema = z.object({
  answer: z
    .string()
    .max(MAX_ANSWER_CHARS, `Please keep an answer under ${MAX_ANSWER_CHARS} characters`),
});

/**
 * The candidate reads their own attempt, its answers and — once scored — the marks per criterion.
 * Only criterion names, limits and awarded marks are selected: privateGuidance (the marking notes
 * and answer key) and privateData are never loaded here.
 */
function findAttempt(attemptId: string, candidateId: string) {
  return prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, candidateId },
    select: {
      id: true,
      versionId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      reviewedAt: true,
      responses: {
        orderBy: { savedAt: "asc" },
        select: { taskId: true, answer: true, savedAt: true },
      },
      criterionScores: { select: { criterionId: true, marks: true } },
      version: {
        select: {
          tasks: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              position: true,
              marks: true,
              rubric: {
                orderBy: { position: "asc" },
                select: { id: true, position: true, name: true, maxMarks: true },
              },
            },
          },
        },
      },
    },
  });
}

type AttemptRecord = NonNullable<Awaited<ReturnType<typeof findAttempt>>>;

/** The rubric's marks for this attempt, per criterion and summed over the assessment. */
function buildResult(attempt: AttemptRecord) {
  const scoreByCriterion = new Map(
    attempt.criterionScores.map((score) => [score.criterionId, score.marks]),
  );

  let awarded = 0;
  let possible = 0;
  let scoredCriteria = 0;
  let criterionCount = 0;

  const criteria = attempt.version.tasks.flatMap((task) => {
    possible += task.marks;
    return task.rubric.map((criterion) => {
      const marks = scoreByCriterion.get(criterion.id) ?? null;
      criterionCount += 1;
      if (marks !== null) {
        scoredCriteria += 1;
        awarded += marks;
      }
      return {
        criterionId: criterion.id,
        taskId: task.id,
        position: criterion.position,
        name: criterion.name,
        maxMarks: criterion.maxMarks,
        awarded: marks,
        taskMarks: task.marks,
      };
    });
  });

  return {
    awarded,
    possible,
    scoredCriteria,
    criterionCount,
    reviewedAt: attempt.reviewedAt,
    criteria,
  };
}

/** The attempt's own fields, its saved answers, and its result once it is submitted. */
function serializeAttempt(attempt: AttemptRecord) {
  return {
    id: attempt.id,
    versionId: attempt.versionId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    reviewedAt: attempt.reviewedAt,
    responses: attempt.responses.map((response) => ({
      taskId: response.taskId,
      answer: response.answer,
      savedAt: response.savedAt,
    })),
    // A half-marked attempt still reports the marks that exist; the page says marking continues.
    result: attempt.status === "SUBMITTED" ? buildResult(attempt) : null,
  };
}

/** Reads a known attempt and serializes it; every caller passes an id it just resolved itself. */
async function attemptDetail(attemptId: string, candidateId: string) {
  const attempt = await findAttempt(attemptId, candidateId);
  if (!attempt) throw new Error("Attempt disappeared while it was being read");
  return serializeAttempt(attempt);
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

// Starts the candidate's attempt on a published version, or resumes the one they already have.
candidateAttemptsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsed.error) });
      return;
    }

    const versionId = parsed.data.versionId;
    const version = await prisma.assessmentVersion.findFirst({
      where: { id: versionId, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!version) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    const candidateId = currentUser(res).id;
    const existing = await prisma.assessmentAttempt.findUnique({
      where: { versionId_candidateId: { versionId, candidateId } },
      select: { id: true },
    });
    if (existing) {
      res.json(await attemptDetail(existing.id, candidateId));
      return;
    }

    try {
      const created = await prisma.assessmentAttempt.create({
        data: { versionId, candidateId },
        select: { id: true },
      });
      res.status(201).json(await attemptDetail(created.id, candidateId));
    } catch (err) {
      // Two tabs can start at once; the unique pair means one wins and the other resumes it.
      if (!isUniqueConstraintError(err)) throw err;
      const attempt = await prisma.assessmentAttempt.findUnique({
        where: { versionId_candidateId: { versionId, candidateId } },
        select: { id: true },
      });
      if (!attempt) throw err;
      res.json(await attemptDetail(attempt.id, candidateId));
    }
  }),
);

// The candidate's own attempt on a version, so the page can open in its real state.
// `attempt: null` means they have not started it yet, which is not an error.
candidateAttemptsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : "";
    if (!versionId) {
      res.status(400).json({ error: "versionId is required" });
      return;
    }

    const candidateId = currentUser(res).id;
    const found = await prisma.assessmentAttempt.findUnique({
      where: { versionId_candidateId: { versionId, candidateId } },
      select: { id: true },
    });
    const attempt = found ? await findAttempt(found.id, candidateId) : null;

    res.json({ attempt: attempt ? serializeAttempt(attempt) : null });
  }),
);

candidateAttemptsRouter.get(
  "/:attemptId",
  asyncHandler(async (req, res) => {
    const attempt = await findAttempt(routeParam(req.params.attemptId), currentUser(res).id);
    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    res.json(serializeAttempt(attempt));
  }),
);

// Submits the attempt and locks it: answers can no longer be saved afterwards.
candidateAttemptsRouter.post(
  "/:attemptId/submit",
  asyncHandler(async (req, res) => {
    const attemptId = routeParam(req.params.attemptId);
    const candidateId = currentUser(res).id;
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, candidateId },
      select: { id: true },
    });
    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    // The status filter makes the first submit win; a second one changes nothing.
    const locked = await prisma.assessmentAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    if (locked.count === 0) {
      res.status(409).json({ error: "This attempt has already been submitted" });
      return;
    }

    const submitted = await findAttempt(attempt.id, candidateId);
    if (!submitted) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    res.json(serializeAttempt(submitted));
  }),
);

// Saves one task's answer, replacing any earlier draft of it.
candidateAttemptsRouter.put(
  "/:attemptId/responses/:taskId",
  asyncHandler(async (req, res) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid answer", details: formatZodIssues(parsed.error) });
      return;
    }

    const attemptId = routeParam(req.params.attemptId);
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, candidateId: currentUser(res).id },
      select: { id: true, versionId: true, status: true },
    });
    if (!attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if (attempt.status !== "IN_PROGRESS") {
      res.status(409).json({ error: "This attempt has already been submitted" });
      return;
    }

    const taskId = routeParam(req.params.taskId);
    // Only tasks of this attempt's own version can be answered.
    const task = await prisma.assessmentTask.findFirst({
      where: { id: taskId, versionId: attempt.versionId },
      select: { id: true },
    });
    if (!task) {
      res.status(404).json({ error: "Task not found in this assessment" });
      return;
    }

    const response = await prisma.assessmentResponse.upsert({
      where: { attemptId_taskId: { attemptId, taskId } },
      update: { answer: parsed.data.answer },
      create: { attemptId, taskId, answer: parsed.data.answer },
    });

    res.json({
      taskId: response.taskId,
      answer: response.answer,
      savedAt: response.savedAt,
    });
  }),
);
