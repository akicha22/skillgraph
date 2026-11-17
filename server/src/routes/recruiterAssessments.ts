import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { parseRequirements, warnOnUnknownSlugs } from "../assessments/requirementParser";
import type { Level, Difficulty } from "../assessments/constants";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { generationSchema } from "../assessments/generationSchema";
import { generateAssessmentDraft } from "../ai";
import { DraftValidationError, draftUpdateSchema, planDraftUpdate, serializeDraft } from "../assessments/draft";
import { env } from "../env";

export const recruiterAssessmentsRouter = Router();
recruiterAssessmentsRouter.use(requireAuth, requireRole("RECRUITER"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const parseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Describe the candidate you're looking for in a sentence or two")
    .max(3000, "Please keep the description under 3000 characters"),
});

recruiterAssessmentsRouter.post(
  "/parse-requirements",
  asyncHandler(async (req, res) => {
    const parsed = parseSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsed.error) });
        return;
    }
    const library = await prisma.skill.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { sortOrder: "asc" },
    });
    warnOnUnknownSlugs(library.map((s) => s.slug));
    res.json(parseRequirements(parsed.data.text, library));
  }),
);

recruiterAssessmentsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const parsedBody = generationSchema.safeParse(req.body);
    if (!parsedBody.success) {
        res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsedBody.error) });
        return;
    }
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
        res.status(403).json({ error: "Recruiter role required" });
        return;
    }
    const { requirementsText, companyName, jobTitle, targetSkills, aiPolicy, difficulty, durationMinutes, taskCount, preferredAssessmentTypes } = parsedBody.data as {
      requirementsText: string;
      companyName: string;
      jobTitle?: string;
      targetSkills: { skillSlug: string; weight: number; subskills: string[]; source: "REQUESTED" | "SUGGESTED_APPROVED" }[];
      aiPolicy: "NOT_ALLOWED" | "ALLOWED_DISCLOSED";
      difficulty?: string;
      durationMinutes?: number;
      taskCount?: number;
      preferredAssessmentTypes?: string[];
      description?: string;
    };
    if (!companyName) {
        res.status(400).json({ error: "companyName is required" });
        return;
    }
    // Resolve skills and validate existence
    const skillSlugs = targetSkills.map((s: { skillSlug: string }) => s.skillSlug);
    const skills = await prisma.skill.findMany({
        where: { slug: { in: skillSlugs } },
        include: { subskills: true },
    });
    if (skills.length !== skillSlugs.length) {
        const missing = skillSlugs.filter((s) => !skills.find((sk) => sk.slug === s));
        res.status(400).json({ error: "Missing skills", missing });
        return;
    }
    // Validate subskills belong to parent skills
    const skillMap = new Map(skills.map((s: { slug: string; subskills: { slug: string }[] }) => [s.slug, s]));
    for (const skill of targetSkills as Array<{ skillSlug: string; subskills: string[] }>) {
        const skillRecord = skillMap.get(skill.skillSlug);
        if (!skillRecord) continue;
        for (const subslug of skill.subskills) {
            if (!skillRecord.subskills.find((s: { slug: string }) => s.slug === subslug)) {
                res.status(400).json({ error: `Subskill ${subslug} not found for skill ${skill.skillSlug}` });
                return;
            }
        }
    }
    // Parse requirements to fill defaults
    const parsedReqs = await parseRequirements(requirementsText, skills);
    // Build final config with explicit types
    interface RecruiterFinalConfig {
        requirementsText: string;
        jobTitle?: string;
        companyName: string;
        targetLevel: Level;
        difficulty: Difficulty;
        durationMinutes: number;
        taskCount: number;
        preferredAssessmentTypes?: string[];
        aiPolicy: "NOT_ALLOWED" | "ALLOWED_DISCLOSED";
        description?: string;
        targetSkills: Array<{ skillSlug: string; weight: number; subskills: string[]; source: "REQUESTED" | "SUGGESTED_APPROVED" }>;
    }
    const finalConfig: RecruiterFinalConfig = {
        requirementsText: parsedBody.data.requirementsText,
        jobTitle: jobTitle ?? (parsedReqs.jobTitle ?? undefined),
        companyName: parsedBody.data.companyName,
        targetLevel: parsedBody.data.targetLevel ?? parsedReqs.targetLevel ?? "FRESHER",
        difficulty: parsedBody.data.difficulty ?? parsedReqs.difficulty ?? "INTERMEDIATE",
        durationMinutes: parsedBody.data.durationMinutes ?? parsedReqs.durationMinutes ?? 45,
        taskCount: taskCount ?? parsedReqs.taskCount ?? targetSkills.length,
        preferredAssessmentTypes: parsedBody.data.preferredAssessmentTypes,
        aiPolicy: parsedBody.data.aiPolicy,
        description: parsedBody.data.description,
        targetSkills,
    };
    if (finalConfig.taskCount < finalConfig.targetSkills.length) {
        res.status(400).json({ error: "Task count cannot be lower than the number of selected skills" });
        return;
    }
    // Generate the draft: AI wording when a provider is configured, template otherwise.
    // Every provider failure falls back to template generation with a recorded reason.
    const draft = await generateAssessmentDraft(
      {
        requirementsText: finalConfig.requirementsText,
        jobTitle: finalConfig.jobTitle,
        companyName: finalConfig.companyName,
        description: finalConfig.description,
        targetLevel: finalConfig.targetLevel,
        difficulty: finalConfig.difficulty,
        durationMinutes: finalConfig.durationMinutes,
        taskCount: finalConfig.taskCount,
        preferredAssessmentTypes: finalConfig.preferredAssessmentTypes,
        aiPolicy: finalConfig.aiPolicy,
        targetSkills: finalConfig.targetSkills,
      },
      {
        prisma,
        ai: { provider: env.AI_PROVIDER, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
      },
    );
    const assembled = draft.assembled;
    // Persist in transaction
    const result = await prisma.$transaction(async (tx) => {
        // Create Assessment root
        const assessment = await tx.assessment.create({
            data: {
                ownerId: currentUser.id,
                jobTitle: finalConfig.jobTitle ?? "Assessment",
                companyName,
                requirementsText,
            },
        });
        // Create first version
        const version = await tx.assessmentVersion.create({
            data: {
                assessmentId: assessment.id,
                versionNumber: 1,
                status: "DRAFT",
                requirementsText,
                title: assembled.title,
                description: assembled.description,
                jobContext: assembled.jobContext,
                candidateInstructions: assembled.candidateInstructions,
                targetLevel: finalConfig.targetLevel,
                difficulty: finalConfig.difficulty,
                durationMinutes: finalConfig.durationMinutes,
                aiPolicy: finalConfig.aiPolicy,
                generationMethod: draft.generationMethod,
                generationModel: draft.generationModel,
                generatedAt: new Date(),
            },
        });
        // Persist skills with weights and subskills
        for (const skill of finalConfig.targetSkills) {
            await tx.assessmentVersionSkill.create({
                data: {
                    versionId: version.id,
                    skillId: skill.skillSlug,
                    weight: skill.weight,
                    source: skill.source,
                    selectedSubskills: JSON.stringify(skill.subskills),
                },
            });
        }
        // Persist tasks
        let taskIdx = 0;
        for (const task of assembled.tasks) {
            await tx.assessmentTask.create({
                data: {
                    versionId: version.id,
                    position: taskIdx,
                    type: task.type,
                    skillId: task.skillSlug,
                    title: task.title,
                    prompt: task.prompt,
                    marks: task.marks,
                    timeMinutes: task.timeMinutes,
                    publicData: JSON.stringify(task.publicData),
                    privateData: JSON.stringify(task.privateData),
                    rubric: {
                        create: task.rubric.map((c, i) => ({
                            position: i,
                            name: c.name,
                            description: c.description,
                            maxMarks: c.maxMarks,
                            privateGuidance: c.privateGuidance,
                        })),
                    },
                },
            });
            taskIdx++;
        }
        // Create audit log
        await tx.auditLog.create({
            data: {
                actorId: currentUser.id,
                action: "GENERATE_ASSESSMENT",
                entityType: "Assessment",
                entityId: assessment.id,
                metadata: JSON.stringify({
                    versionId: version.id,
                    generationMethod: draft.generationMethod,
                    generationModel: draft.generationModel,
                    aiFallback: draft.aiFallback?.code ?? null,
                }),
            },
        });
        return { assessment, version };
    });

    res.status(201).json({
        id: result.assessment.id,
        versionId: result.version.id,
        versionNumber: result.version.versionNumber,
        status: result.version.status,
        generationMethod: result.version.generationMethod,
        generationModel: result.version.generationModel,
        aiFallback: draft.aiFallback,
        assembled,
    });
  }),
);

// ---------- draft read and edit (4D-1) ----------

recruiterAssessmentsRouter.get(
  "/:assessmentId/versions/:versionId",
  asyncHandler(async (req, res) => {
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
      res.status(403).json({ error: "Recruiter role required" });
      return;
    }

    const assessmentId = routeParam(req.params.assessmentId);
    const versionId = routeParam(req.params.versionId);

    const version = await prisma.assessmentVersion.findFirst({
      where: {
        id: versionId,
        assessmentId,
        assessment: { ownerId: currentUser.id },
      },
      include: {
        assessment: true,
        skills: { include: { skill: { include: { subskills: true } } } },
        tasks: {
          orderBy: { position: "asc" },
          include: { skill: true, rubric: { orderBy: { position: "asc" } } },
        },
      },
    });

    if (!version) {
      res.status(404).json({ error: "Assessment draft not found" });
      return;
    }

    res.json(serializeDraft(version));
  }),
);

recruiterAssessmentsRouter.patch(
  "/:assessmentId/versions/:versionId",
  asyncHandler(async (req, res) => {
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
      res.status(403).json({ error: "Recruiter role required" });
      return;
    }

    const parsedBody = draftUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid draft update", details: formatZodIssues(parsedBody.error) });
      return;
    }

    const assessmentId = routeParam(req.params.assessmentId);
    const versionId = routeParam(req.params.versionId);

    const version = await prisma.assessmentVersion.findFirst({
      where: {
        id: versionId,
        assessmentId,
        assessment: { ownerId: currentUser.id },
      },
      include: {
        assessment: true,
        skills: { include: { skill: { include: { subskills: true } } } },
        tasks: {
          orderBy: { position: "asc" },
          include: { skill: true, rubric: { orderBy: { position: "asc" } } },
        },
      },
    });

    if (!version) {
      res.status(404).json({ error: "Assessment draft not found" });
      return;
    }

    // Published versions are immutable: attempts and results must keep the criteria they were scored against.
    if (version.status !== "DRAFT") {
      res.status(409).json({
        error: "This version is published and read-only. Create a new version to change it.",
      });
      return;
    }

    let plan;
    try {
      plan = planDraftUpdate(version, parsedBody.data);
    } catch (err) {
      if (err instanceof DraftValidationError) {
        res.status(400).json({ error: "Draft update is invalid", details: err.issues });
        return;
      }
      throw err;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.assessmentVersion.update({
        where: { id: version.id },
        data: { ...plan.version },
      });

      if (plan.skills) {
        for (const skill of plan.skills) {
          await tx.assessmentVersionSkill.update({
            where: { versionId_skillId: { versionId: version.id, skillId: skill.skillId } },
            data: { weight: skill.weight, selectedSubskills: skill.selectedSubskills },
          });
        }
      }

      if (plan.tasks) {
        for (const task of plan.tasks) {
          await tx.assessmentTask.update({
            where: { id: task.id },
            data: {
              title: task.title,
              prompt: task.prompt,
              marks: task.marks,
              timeMinutes: task.timeMinutes,
              rubric: {
                deleteMany: {},
                create: task.rubric.map((criterion, i) => ({ position: i, ...criterion })),
              },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: "EDIT_DRAFT",
          entityType: "AssessmentVersion",
          entityId: version.id,
          metadata: JSON.stringify({ assessmentId: version.assessmentId, changed: plan.changed }),
        },
      });

      return tx.assessmentVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: {
          assessment: true,
          skills: { include: { skill: { include: { subskills: true } } } },
          tasks: {
            orderBy: { position: "asc" },
            include: { skill: true, rubric: { orderBy: { position: "asc" } } },
          },
        },
      });
    });

    res.json(serializeDraft(updated));
  }),
);