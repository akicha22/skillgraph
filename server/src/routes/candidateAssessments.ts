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
  id: string;
  versionNumber: number;
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  aiPolicy: string;
  durationMinutes: number;
  publishedAt: Date | null;
  assessment: { jobTitle: string; companyName: string };
  skills: { weight: number; skill: { name: string } }[];
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
 */
function serializeCandidateVersion(version: CandidateVersionRecord) {
  const tasks = version.tasks.map((task) => ({
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
  }));

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    jobContext: version.jobContext,
    candidateInstructions: version.candidateInstructions,
    targetLevel: version.targetLevel,
    difficulty: version.difficulty,
    aiPolicy: version.aiPolicy,
    durationMinutes: version.durationMinutes,
    publishedAt: version.publishedAt,
    assessment: {
      jobTitle: version.assessment.jobTitle,
      companyName: version.assessment.companyName,
    },
    skills: version.skills.map((row) => ({ name: row.skill.name, weight: row.weight })),
    tasks,
    totals: {
      marks: tasks.reduce((sum, task) => sum + task.marks, 0),
      durationMinutes: tasks.reduce((sum, task) => sum + task.timeMinutes, 0),
      taskCount: tasks.length,
    },
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
        skills: { include: { skill: true }, orderBy: { weight: "desc" } },
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
