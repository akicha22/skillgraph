import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Submitted attempts, read and scored by the recruiter who owns the assessment.
 *
 * Every response is built from an explicit select so a task's privateData and its rubric
 * privateGuidance (the answer key and marking notes) are never loaded, let alone sent.
 * Practice evidence lives on a separate model and is not joined here at all.
 */
export const recruiterAttemptsRouter = Router();
recruiterAttemptsRouter.use(requireAuth, requireRole("RECRUITER"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// An answer counts only when it has visible text: saving an empty box leaves a row behind,
// and that row must not be counted as an answered task.
function hasAnswer(answer: string | null | undefined): boolean {
  return (answer ?? "").trim().length > 0;
}

// One query for both reads and the score write, so the two can never drift apart.
const submissionQuery = (attemptId: string, ownerId: string) =>
  prisma.assessmentAttempt.findFirst({
    where: {
      id: attemptId,
      status: "SUBMITTED",
      version: { assessment: { ownerId } },
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      reviewedAt: true,
      candidate: { select: { name: true, email: true } },
      responses: { select: { taskId: true, answer: true, savedAt: true } },
      criterionScores: { select: { criterionId: true, marks: true } },
      version: {
        select: {
          id: true,
          title: true,
          durationMinutes: true,
          assessment: { select: { id: true, jobTitle: true, companyName: true } },
          tasks: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              position: true,
              type: true,
              title: true,
              prompt: true,
              marks: true,
              skill: { select: { name: true } },
              rubric: {
                orderBy: { position: "asc" },
                select: { id: true, name: true, description: true, maxMarks: true },
              },
            },
          },
        },
      },
    },
  });

type SubmissionRecord = NonNullable<Awaited<ReturnType<typeof submissionQuery>>>;

/** The answers, the criteria they are scored against, and the running total. */
function serializeSubmission(attempt: SubmissionRecord) {
  const answerByTask = new Map(attempt.responses.map((response) => [response.taskId, response]));
  const scoreByCriterion = new Map(
    attempt.criterionScores.map((score) => [score.criterionId, score.marks]),
  );

  let criterionCount = 0;
  let scoredCriteria = 0;
  let awarded = 0;
  let possible = 0;

  const tasks = attempt.version.tasks.map((task) => {
    possible += task.marks;
    const rubric = task.rubric.map((criterion) => {
      const marks = scoreByCriterion.get(criterion.id) ?? null;
      criterionCount += 1;
      if (marks !== null) {
        scoredCriteria += 1;
        awarded += marks;
      }
      return {
        id: criterion.id,
        name: criterion.name,
        description: criterion.description,
        maxMarks: criterion.maxMarks,
        score: marks,
      };
    });

    const response = answerByTask.get(task.id);
    return {
      id: task.id,
      position: task.position,
      type: task.type,
      title: task.title,
      prompt: task.prompt,
      marks: task.marks,
      skillName: task.skill.name,
      rubric,
      // An empty save arrives as null so every screen treats it as unanswered.
      answer: hasAnswer(response?.answer) ? (response?.answer ?? null) : null,
      savedAt: response?.savedAt ?? null,
    };
  });

  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    candidate: attempt.candidate,
    assessment: {
      assessmentId: attempt.version.assessment.id,
      versionId: attempt.version.id,
      title: attempt.version.title,
      jobTitle: attempt.version.assessment.jobTitle,
      companyName: attempt.version.assessment.companyName,
      durationMinutes: attempt.version.durationMinutes,
    },
    score: {
      awarded,
      possible,
      scoredCriteria,
      criterionCount,
      reviewedAt: attempt.reviewedAt,
    },
    tasks,
  };
}

// Everyone who has submitted a version, most recent first.
recruiterAttemptsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : "";
    if (!versionId) {
      res.status(400).json({ error: "versionId is required" });
      return;
    }

    const version = await prisma.assessmentVersion.findFirst({
      where: { id: versionId, assessment: { ownerId: currentUser(res).id } },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        _count: { select: { tasks: true } },
      },
    });
    if (!version) {
      res.status(404).json({ error: "Assessment version not found" });
      return;
    }

    const attempts = await prisma.assessmentAttempt.findMany({
      where: { versionId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        submittedAt: true,
        candidate: { select: { name: true, email: true } },
        // Counted here rather than with _count so an empty saved answer is not an answer.
        responses: { select: { answer: true } },
      },
    });

    res.json({
      version: {
        id: version.id,
        title: version.title,
        taskCount: version._count.tasks,
        durationMinutes: version.durationMinutes,
      },
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        candidateName: attempt.candidate.name,
        candidateEmail: attempt.candidate.email,
        submittedAt: attempt.submittedAt,
        answeredTaskCount: attempt.responses.filter((response) => hasAnswer(response.answer))
          .length,
      })),
    });
  }),
);

// One submitted attempt: the answers next to the criteria they are scored against.
recruiterAttemptsRouter.get(
  "/:attemptId",
  asyncHandler(async (req, res) => {
    const attempt = await submissionQuery(routeParam(req.params.attemptId), currentUser(res).id);
    if (!attempt) {
      res.status(404).json({ error: "Submitted attempt not found" });
      return;
    }
    res.json(serializeSubmission(attempt));
  }),
);

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.string().min(1),
        marks: z.number().int("Marks must be a whole number").min(0, "Marks cannot be negative"),
      }),
    )
    .max(500),
});

// Saves the recruiter's marks. The payload is the full set of scored criteria, so anything left
// out is cleared: a criterion the recruiter emptied stops counting towards the total.
recruiterAttemptsRouter.put(
  "/:attemptId/scores",
  asyncHandler(async (req, res) => {
    const parsed = scoresSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid scores", details: formatZodIssues(parsed.error) });
      return;
    }

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: routeParam(req.params.attemptId),
        status: "SUBMITTED",
        version: { assessment: { ownerId: currentUser(res).id } },
      },
      select: { id: true, versionId: true },
    });
    if (!attempt) {
      res.status(404).json({ error: "Submitted attempt not found" });
      return;
    }

    const criteria = await prisma.assessmentRubricCriterion.findMany({
      where: { task: { versionId: attempt.versionId } },
      select: { id: true, maxMarks: true, task: { select: { title: true } } },
    });
    const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));

    const seen = new Set<string>();
    for (const { criterionId, marks } of parsed.data.scores) {
      const criterion = criteriaById.get(criterionId);
      if (!criterion) {
        res.status(400).json({ error: "A criterion does not belong to this assessment" });
        return;
      }
      if (seen.has(criterionId)) {
        res.status(400).json({ error: "Each criterion can only be scored once" });
        return;
      }
      seen.add(criterionId);
      if (marks > criterion.maxMarks) {
        res.status(400).json({
          error: `Marks for "${criterion.task.title}" cannot exceed ${criterion.maxMarks}`,
        });
        return;
      }
    }

    // reviewedAt means "every criterion is scored"; a half-scored attempt is still in review.
    const complete = criteria.length > 0 && parsed.data.scores.length === criteria.length;

    await prisma.$transaction([
      prisma.assessmentCriterionScore.deleteMany({
        where: { attemptId: attempt.id, criterionId: { notIn: [...seen] } },
      }),
      ...parsed.data.scores.map(({ criterionId, marks }) =>
        prisma.assessmentCriterionScore.upsert({
          where: { attemptId_criterionId: { attemptId: attempt.id, criterionId } },
          update: { marks },
          create: { attemptId: attempt.id, criterionId, marks },
        }),
      ),
      prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: { reviewedAt: complete ? new Date() : null },
      }),
    ]);

    const submission = await submissionQuery(attempt.id, currentUser(res).id);
    if (!submission) {
      res.status(404).json({ error: "Submitted attempt not found" });
      return;
    }
    res.json(serializeSubmission(submission));
  }),
);
