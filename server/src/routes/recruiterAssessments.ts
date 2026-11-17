import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { parseRequirements, warnOnUnknownSlugs } from "../assessments/requirementParser";
import type { Level, Difficulty } from "../assessments/constants";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { generationSchema } from "../assessments/generationSchema";
import { assembleAssessment } from "../assessments/assembler";

export const recruiterAssessmentsRouter = Router();
recruiterAssessmentsRouter.use(requireAuth, requireRole("RECRUITER"));

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
  "/api/recruiter/assessments/generate",
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
    // Assemble assessment
    const assembled = await assembleAssessment({
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
    }, prisma);
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
                generationMethod: "TEMPLATE",
                generationModel: null,
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
                    generationMethod: "TEMPLATE",
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
        generationModel: null,
        assembled,
    });
  }),
);