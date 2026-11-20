import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { summariseActivity } from "../assessments/attemptActivity";
import { buildFollowUpQuestions } from "../assessments/followUps";
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
      // The candidate's written answers to the follow-up questions, if they have written any.
      followUps: { select: { criterionId: true, answer: true, updatedAt: true } },
      version: {
        select: {
          id: true,
          versionNumber: true,
          title: true,
          durationMinutes: true,
          difficulty: true,
          targetLevel: true,
          aiPolicy: true,
          generationMethod: true,
          generationModel: true,
          publishedAt: true,
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
              publicData: true,
              privateData: true,
              skill: { select: { id: true, name: true } },
              rubric: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  position: true,
                  name: true,
                  description: true,
                  maxMarks: true,
                  privateGuidance: true,
                },
              },
            },
          },
        },
      },
    },
  });

type SubmissionRecord = NonNullable<Awaited<ReturnType<typeof submissionQuery>>>;

/** Only the expected values of a data task, from privateData; nothing else of it is exposed. */
function answerKeyOf(privateData: string): Record<string, string | number> {
  try {
    const parsed: unknown = JSON.parse(privateData);
    const key =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).answerKey
        : null;
    if (typeof key !== "object" || key === null) return {};
    return Object.fromEntries(
      Object.entries(key as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" || typeof value === "number")
        .map(([name, value]) => [name, value as string | number]),
    );
  } catch {
    return {};
  }
}

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

  // Per skill: only marked criteria count towards the marks, coverage says how much is marked.
  const skills = new Map<
    string,
    {
      skillId: string;
      name: string;
      awarded: number;
      possible: number;
      scoredCriteria: number;
      criterionCount: number;
    }
  >();

  const tasks = attempt.version.tasks.map((task) => {
    possible += task.marks;
    const rubric = task.rubric.map((criterion) => {
      const marks = scoreByCriterion.get(criterion.id) ?? null;
      criterionCount += 1;
      if (marks !== null) {
        scoredCriteria += 1;
        awarded += marks;
      }

      const skill = skills.get(task.skill.id) ?? {
        skillId: task.skill.id,
        name: task.skill.name,
        awarded: 0,
        possible: 0,
        scoredCriteria: 0,
        criterionCount: 0,
      };
      skill.possible += criterion.maxMarks;
      skill.criterionCount += 1;
      if (marks !== null) {
        skill.awarded += marks;
        skill.scoredCriteria += 1;
      }
      skills.set(task.skill.id, skill);

      return {
        id: criterion.id,
        name: criterion.name,
        description: criterion.description,
        guidance: criterion.privateGuidance,
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
      skillId: task.skill.id,
      skillName: task.skill.name,
      answerKey: answerKeyOf(task.privateData),
      rubric,
      // An empty save arrives as null so every screen treats it as unanswered.
      answer: hasAnswer(response?.answer) ? (response?.answer ?? null) : null,
      savedAt: response?.savedAt ?? null,
    };
  });

  // The same questions the candidate is asked after submitting, built from the weakest or
  // unmarked criteria by a shared fixed rule. Rule-based from the rubric: no AI, no outcome.
  const answerByCriterion = new Map(attempt.followUps.map((row) => [row.criterionId, row]));
  const followUpQuestions = buildFollowUpQuestions(
    tasks.map((task) => ({
      id: task.id,
      title: task.title,
      rubric: task.rubric.map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        maxMarks: criterion.maxMarks,
        score: criterion.score,
      })),
    })),
  ).map((question) => {
    const saved = answerByCriterion.get(question.criterionId);
    return {
      ...question,
      candidateAnswer: hasAnswer(saved?.answer) ? (saved?.answer ?? null) : null,
      answerSavedAt: saved?.updatedAt ?? null,
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
      versionNumber: attempt.version.versionNumber,
      difficulty: attempt.version.difficulty,
      targetLevel: attempt.version.targetLevel,
      aiPolicy: attempt.version.aiPolicy,
      generationMethod: attempt.version.generationMethod,
      generationModel: attempt.version.generationModel,
      publishedAt: attempt.version.publishedAt,
    },
    score: {
      awarded,
      possible,
      scoredCriteria,
      criterionCount,
      pendingCriteria: criterionCount - scoredCriteria,
      reviewedAt: attempt.reviewedAt,
    },
    skills: [...skills.values()].map((skill) => ({
      ...skill,
      coverage:
        skill.criterionCount === 0
          ? 0
          : Math.round((skill.scoredCriteria / skill.criterionCount) * 100),
    })),
    followUpQuestions,
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
        tasks: { select: { marks: true } },
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
        reviewedAt: true,
        candidate: { select: { name: true, email: true } },
        // Counted here rather than with _count so an empty saved answer is not an answer.
        responses: { select: { answer: true } },
        criterionScores: { select: { marks: true } },
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
        reviewedAt: attempt.reviewedAt,
        answeredTaskCount: attempt.responses.filter((response) => hasAnswer(response.answer))
          .length,
        awarded: attempt.criterionScores.reduce((sum, score) => sum + score.marks, 0),
        scoredCriteria: attempt.criterionScores.length,
        possible: version.tasks.reduce((sum, task) => sum + task.marks, 0),
      })),
    });
  }),
);

/** Saved weights as rows; a malformed column reads as "nothing saved" instead of throwing. */
function parseWeights(value: string): { skillId: string; weight: number }[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (typeof row !== "object" || row === null) return [];
      const { skillId, weight } = row as { skillId?: unknown; weight?: unknown };
      if (typeof skillId !== "string" || typeof weight !== "number" || !Number.isFinite(weight)) {
        return [];
      }
      return [{ skillId, weight }];
    });
  } catch {
    return [];
  }
}

// The comparison weights this recruiter saved for a version, if any.
recruiterAttemptsRouter.get(
  "/compare/weights",
  asyncHandler(async (req, res) => {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : "";
    if (!versionId) {
      res.status(400).json({ error: "versionId is required" });
      return;
    }

    const version = await prisma.assessmentVersion.findFirst({
      where: { id: versionId, assessment: { ownerId: currentUser(res).id } },
      select: { id: true },
    });
    if (!version) {
      res.status(404).json({ error: "Assessment version not found" });
      return;
    }

    const saved = await prisma.comparisonWeights.findUnique({
      where: { versionId },
      select: { weights: true, updatedAt: true },
    });
    res.json({
      weights: saved ? parseWeights(saved.weights) : null,
      updatedAt: saved?.updatedAt ?? null,
    });
  }),
);

const comparisonWeightsSchema = z.object({
  versionId: z.string().min(1, "Choose an assessment version"),
  weights: z
    .array(
      z.object({
        skillId: z.string().min(1),
        weight: z.number().int("Weights must be whole numbers").min(0).max(100),
      }),
    )
    .max(50),
});

// Saves the recruiter's weighting for this version. An empty list clears it back to no saved weights.
recruiterAttemptsRouter.put(
  "/compare/weights",
  asyncHandler(async (req, res) => {
    const parsed = comparisonWeightsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid weights", details: formatZodIssues(parsed.error) });
      return;
    }

    const version = await prisma.assessmentVersion.findFirst({
      where: { id: parsed.data.versionId, assessment: { ownerId: currentUser(res).id } },
      select: { id: true, skills: { select: { skillId: true } } },
    });
    if (!version) {
      res.status(404).json({ error: "Assessment version not found" });
      return;
    }

    const skillIds = new Set(version.skills.map((skill) => skill.skillId));
    const seen = new Set<string>();
    for (const { skillId } of parsed.data.weights) {
      if (!skillIds.has(skillId)) {
        res.status(400).json({ error: "A skill does not belong to this assessment version" });
        return;
      }
      if (seen.has(skillId)) {
        res.status(400).json({ error: "Each skill can only be weighted once" });
        return;
      }
      seen.add(skillId);
    }

    if (parsed.data.weights.length === 0) {
      await prisma.comparisonWeights.deleteMany({ where: { versionId: version.id } });
      res.json({ weights: null, updatedAt: null });
      return;
    }

    const saved = await prisma.comparisonWeights.upsert({
      where: { versionId: version.id },
      update: { weights: JSON.stringify(parsed.data.weights) },
      create: { versionId: version.id, weights: JSON.stringify(parsed.data.weights) },
      select: { updatedAt: true },
    });
    res.json({ weights: parsed.data.weights, updatedAt: saved.updatedAt });
  }),
);

// Two to four submitted attempts of the same version, aggregated per skill for a side-by-side
// comparison. Only the owning recruiter can compare, and unmarked criteria are never counted.
recruiterAttemptsRouter.get(
  "/compare",
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.attemptIds === "string" ? req.query.attemptIds : "";
    const attemptIds = [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
    if (attemptIds.length < 2 || attemptIds.length > 4) {
      res.status(400).json({ error: "Choose two to four submissions to compare" });
      return;
    }

    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        id: { in: attemptIds },
        status: "SUBMITTED",
        version: { assessment: { ownerId: currentUser(res).id } },
      },
      select: {
        id: true,
        submittedAt: true,
        reviewedAt: true,
        candidate: { select: { name: true, email: true } },
        criterionScores: { select: { criterionId: true, marks: true } },
        version: {
          select: {
            id: true,
            title: true,
            versionNumber: true,
            tasks: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                skill: { select: { id: true, name: true } },
                rubric: { select: { id: true, maxMarks: true } },
              },
            },
          },
        },
      },
    });
    if (attempts.length !== attemptIds.length) {
      res.status(404).json({ error: "One of those submissions was not found" });
      return;
    }
    if (new Set(attempts.map((attempt) => attempt.version.id)).size !== 1) {
      res.status(400).json({ error: "Only submissions of the same version can be compared" });
      return;
    }

    const version = attempts[0].version;
    const skills = new Map<string, { skillId: string; name: string }>();
    for (const task of version.tasks) {
      skills.set(task.skill.id, { skillId: task.skill.id, name: task.skill.name });
    }

    const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
    const candidates = attemptIds.map((attemptId) => {
      const attempt = byId.get(attemptId)!;
      const scoreByCriterion = new Map(
        attempt.criterionScores.map((score) => [score.criterionId, score.marks]),
      );

      let awarded = 0;
      let scoredCriteria = 0;
      let criterionCount = 0;
      const perSkill = new Map<
        string,
        {
          skillId: string;
          awarded: number;
          possible: number;
          scoredCriteria: number;
          criterionCount: number;
        }
      >();

      for (const task of attempt.version.tasks) {
        for (const criterion of task.rubric) {
          const marks = scoreByCriterion.get(criterion.id) ?? null;
          criterionCount += 1;
          if (marks !== null) {
            scoredCriteria += 1;
            awarded += marks;
          }

          const entry = perSkill.get(task.skill.id) ?? {
            skillId: task.skill.id,
            awarded: 0,
            possible: 0,
            scoredCriteria: 0,
            criterionCount: 0,
          };
          entry.possible += criterion.maxMarks;
          entry.criterionCount += 1;
          if (marks !== null) {
            entry.awarded += marks;
            entry.scoredCriteria += 1;
          }
          perSkill.set(task.skill.id, entry);
        }
      }

      return {
        attemptId,
        candidate: attempt.candidate,
        submittedAt: attempt.submittedAt,
        reviewedAt: attempt.reviewedAt,
        awarded,
        possible: [...perSkill.values()].reduce((sum, skill) => sum + skill.possible, 0),
        scoredCriteria,
        criterionCount,
        skills: [...perSkill.values()],
      };
    });

    res.json({
      version: { id: version.id, title: version.title, versionNumber: version.versionNumber },
      skills: [...skills.values()],
      candidates,
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

// The activity signals of one submitted attempt, summarised. Only counts, times and pasted
// lengths leave here: no raw metadata, no event rows and never an answer.
recruiterAttemptsRouter.get(
  "/:attemptId/activity",
  asyncHandler(async (req, res) => {
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: routeParam(req.params.attemptId),
        status: "SUBMITTED",
        version: { assessment: { ownerId: currentUser(res).id } },
      },
      select: {
        id: true,
        events: {
          orderBy: { occurredAt: "asc" },
          select: { type: true, taskId: true, occurredAt: true, metadata: true },
        },
        version: {
          select: {
            tasks: {
              orderBy: { position: "asc" },
              select: { id: true, position: true, title: true },
            },
          },
        },
      },
    });
    if (!attempt) {
      res.status(404).json({ error: "Submitted attempt not found" });
      return;
    }

    res.json(summariseActivity(attempt.events, attempt.version.tasks));
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
