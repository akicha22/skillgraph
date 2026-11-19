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
    const versions = await prisma.assessmentVersion.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        assessment: { select: { jobTitle: true, companyName: true } },
        _count: { select: { tasks: true } },
      },
    });

    res.json({
      assessments: versions.map((version) => ({
        id: version.id,
        title: version.title,
        companyName: version.assessment.companyName,
        jobTitle: version.assessment.jobTitle,
        durationMinutes: version.durationMinutes,
        taskCount: version._count.tasks,
      })),
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
