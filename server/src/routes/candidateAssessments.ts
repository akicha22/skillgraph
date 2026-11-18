import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const candidateAssessmentsRouter = Router();
candidateAssessmentsRouter.use(requireAuth, requireRole("CANDIDATE"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseData(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type CandidateVersionRecord = {
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  aiPolicy: string;
  durationMinutes: number;
  assessment: { jobTitle: string; companyName: string };
  tasks: {
    id: string;
    position: number;
    type: string;
    title: string;
    prompt: string;
    marks: number;
    timeMinutes: number;
    publicData: string;
    skill: { name: string };
    rubric: { position: number; name: string; description: string; maxMarks: number }[];
  }[];
};

/**
 * Builds the candidate's view from an allowlist, so privateData, privateGuidance, the answer
 * key and the recruiter's brief can never reach a candidate by being spread in by mistake.
 * Only fields the candidate page renders are included.
 */
function serializeCandidateVersion(version: CandidateVersionRecord) {
  return {
    title: version.title,
    description: version.description,
    jobContext: version.jobContext,
    candidateInstructions: version.candidateInstructions,
    targetLevel: version.targetLevel,
    difficulty: version.difficulty,
    aiPolicy: version.aiPolicy,
    durationMinutes: version.durationMinutes,
    assessment: {
      jobTitle: version.assessment.jobTitle,
      companyName: version.assessment.companyName,
    },
    tasks: version.tasks.map((task) => ({
      id: task.id,
      position: task.position,
      type: task.type,
      skillName: task.skill.name,
      title: task.title,
      prompt: task.prompt,
      marks: task.marks,
      timeMinutes: task.timeMinutes,
      publicData: parseData(task.publicData),
      rubric: task.rubric.map((criterion) => ({
        position: criterion.position,
        name: criterion.name,
        description: criterion.description,
        maxMarks: criterion.maxMarks,
      })),
    })),
  };
}

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

    res.json(serializeCandidateVersion(version));
  }),
);
