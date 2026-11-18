import { Router } from "express";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Submitted attempts, read by the recruiter who owns the assessment.
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
        _count: { select: { responses: true } },
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
        answeredTaskCount: attempt._count.responses,
      })),
    });
  }),
);

// One submitted attempt: the answers next to the criteria they will be scored against.
recruiterAttemptsRouter.get(
  "/:attemptId",
  asyncHandler(async (req, res) => {
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: routeParam(req.params.attemptId),
        status: "SUBMITTED",
        version: { assessment: { ownerId: currentUser(res).id } },
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        candidate: { select: { name: true, email: true } },
        responses: { select: { taskId: true, answer: true, savedAt: true } },
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
                  select: { name: true, description: true, maxMarks: true },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      res.status(404).json({ error: "Submitted attempt not found" });
      return;
    }

    const answerByTask = new Map(attempt.responses.map((response) => [response.taskId, response]));

    res.json({
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
      tasks: attempt.version.tasks.map((task) => ({
        id: task.id,
        position: task.position,
        type: task.type,
        title: task.title,
        prompt: task.prompt,
        marks: task.marks,
        skillName: task.skill.name,
        rubric: task.rubric,
        answer: answerByTask.get(task.id)?.answer ?? null,
        savedAt: answerByTask.get(task.id)?.savedAt ?? null,
      })),
    });
  }),
);
