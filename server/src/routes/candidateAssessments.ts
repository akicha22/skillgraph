import { Router } from "express";
import { serializeCandidateVersion } from "../assessments/candidateView";
import { prisma } from "../db";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const candidateAssessmentsRouter = Router();
candidateAssessmentsRouter.use(requireAuth, requireRole("CANDIDATE"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// The published versions a candidate can open, newest first; drafts never appear here.
candidateAssessmentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const candidateId = currentUser(res).id;
    const versions = await prisma.assessmentVersion.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        assessment: { select: { jobTitle: true, companyName: true } },
        _count: { select: { tasks: true } },
        tasks: { select: { marks: true } },
        // The candidate's own attempt, so the dashboard can split open from completed work.
        attempts: {
          where: { candidateId },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
            criterionScores: { select: { marks: true } },
          },
        },
      },
    });

    res.json({
      assessments: versions.map((version) => {
        const attempt = version.attempts[0] ?? null;
        return {
          id: version.id,
          title: version.title,
          companyName: version.assessment.companyName,
          jobTitle: version.assessment.jobTitle,
          durationMinutes: version.durationMinutes,
          taskCount: version._count.tasks,
          attempt: attempt
            ? {
                id: attempt.id,
                status: attempt.status,
                submittedAt: attempt.submittedAt,
                reviewedAt: attempt.reviewedAt,
                awarded: attempt.criterionScores.reduce((sum, score) => sum + score.marks, 0),
                possible: version.tasks.reduce((sum, task) => sum + task.marks, 0),
              }
            : null,
        };
      }),
    });
  }),
);

// Published versions only: a recruiter's draft is never readable from the candidate side.
candidateAssessmentsRouter.get(
  "/:versionId",
  asyncHandler(async (req, res) => {
    const version = await prisma.assessmentVersion.findFirst({
      where: { id: routeParam(req.params.versionId), status: "PUBLISHED" },
      include: {
        assessment: true,
        tasks: {
          orderBy: { position: "asc" },
          include: { skill: true, rubric: { orderBy: { position: "asc" } } },
        },
      },
    });

    if (!version) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    const started =
      (await prisma.assessmentAttempt.count({
        where: { versionId: version.id, candidateId: currentUser(res).id },
      })) > 0;

    res.json(serializeCandidateVersion(version, started));
  }),
);
