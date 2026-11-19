import { Router } from "express";
import { z } from "zod";
import { formatZodIssues } from "../auth/schemas";
import { prisma } from "../db";
import { parseRequirements, warnOnUnknownSlugs } from "../assessments/requirementParser";
import { clarificationQuestions, mergeClarifications } from "../assessments/clarify";
import { LEVELS, type Level, type Difficulty } from "../assessments/constants";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { generationSchemaWithRefinements } from "../assessments/generationSchema";
import { generateAssessmentDraft } from "../ai";
import {
  buildVersionCopy,
  DraftValidationError,
  draftUpdateSchema,
  planDraftUpdate,
  publishIssues,
  serializeDraft,
} from "../assessments/draft";
import { env } from "../env";

export const recruiterAssessmentsRouter = Router();
recruiterAssessmentsRouter.use(requireAuth, requireRole("RECRUITER"));

// Express 5 types route params as string | string[]; these routes only ever take one value.
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

const parseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Describe the candidate you're looking for in a sentence or two")
    .max(3000, "Please keep the description under 3000 characters"),
});

// The recruiter's own assessments, newest activity first, so a draft can be found again.
recruiterAssessmentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
      res.status(403).json({ error: "Recruiter role required" });
      return;
    }

    const assessments = await prisma.assessment.findMany({
      where: { ownerId: currentUser.id },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: {
          orderBy: { versionNumber: "asc" },
          include: { _count: { select: { tasks: true } } },
        },
      },
    });

    // Every assessment is created with a first version; flatMap skips any that somehow has none.
    res.json({
      assessments: assessments.flatMap((assessment) => {
        const latest = assessment.versions[assessment.versions.length - 1];
        if (!latest) return [];
        return [
          {
            id: assessment.id,
            jobTitle: assessment.jobTitle,
            companyName: assessment.companyName,
            versionCount: assessment.versions.length,
            latestVersion: {
              id: latest.id,
              versionNumber: latest.versionNumber,
              status: latest.status,
              title: latest.title,
              durationMinutes: latest.durationMinutes,
              taskCount: latest._count.tasks,
              updatedAt: latest.updatedAt,
            },
          },
        ];
      }),
    });
  }),
);

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

const clarifySchema = z.object({
  requirementsText: z.string().trim().min(10).max(3000),
  jobTitle: z.string().trim().max(100).optional(),
  targetLevel: z.enum(LEVELS).optional(),
  skillSlugs: z.array(z.string().min(1).max(80)).max(8).default([]),
});

// Asks only for what the brief is missing. An empty list means the recruiter is not interrupted.
recruiterAssessmentsRouter.post(
  "/clarify",
  asyncHandler(async (req, res) => {
    const parsed = clarifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsed.error) });
      return;
    }

    const skills =
      parsed.data.skillSlugs.length > 0
        ? await prisma.skill.findMany({
            where: { slug: { in: parsed.data.skillSlugs } },
            select: { slug: true, name: true },
          })
        : [];

    res.json({
      questions: clarificationQuestions({
        requirementsText: parsed.data.requirementsText,
        jobTitle: parsed.data.jobTitle,
        targetLevel: parsed.data.targetLevel,
        skillSlugs: skills.map((skill) => skill.slug),
        skillNames: skills.map((skill) => skill.name),
      }),
    });
  }),
);

recruiterAssessmentsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const parsedBody = generationSchemaWithRefinements.safeParse(req.body);
    if (!parsedBody.success) {
        res.status(400).json({ error: "Invalid request", details: formatZodIssues(parsedBody.error) });
        return;
    }
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
        res.status(403).json({ error: "Recruiter role required" });
        return;
    }
    const { requirementsText, companyName, jobTitle, targetSkills, aiPolicy, difficulty, durationMinutes, taskCount, preferredAssessmentTypes, clarifications } = parsedBody.data as {
      requirementsText: string;
      clarifications: { question: string; answer: string }[];
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
    // Rows store the skill's database id; the API speaks slugs.
    const skillIdBySlug = new Map<string, string>(skills.map((s) => [s.slug, s.id]));
    const skillIdFor = (slug: string): string => {
        const id = skillIdBySlug.get(slug);
        if (!id) throw new Error(`Skill "${slug}" disappeared between validation and save`);
        return id;
    };
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
    // The recruiter's answers are part of the brief from here on: defaults are parsed from the
    // merged text and the stored version keeps it, so the context that produced the scenarios is
    // visible next to the draft.
    const brief = mergeClarifications(requirementsText, clarifications ?? []);
    const parsedReqs = await parseRequirements(brief, skills);
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
        requirementsText: brief,
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
            },
        });
        // Create first version
        const version = await tx.assessmentVersion.create({
            data: {
                assessmentId: assessment.id,
                versionNumber: 1,
                status: "DRAFT",
                requirementsText: brief,
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
                    skillId: skillIdFor(skill.skillSlug),
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
                    skillId: skillIdFor(task.skillSlug),
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

// ---------- publish and versioning (4D-2) ----------

recruiterAssessmentsRouter.post(
  "/:assessmentId/versions/:versionId/publish",
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

    if (version.status === "PUBLISHED") {
      res.status(409).json({ error: "This version is already published." });
      return;
    }
    if (version.status !== "DRAFT") {
      res.status(409).json({ error: `Only a draft can be published (this version is ${version.status}).` });
      return;
    }

    const issues = publishIssues(version);
    if (issues.length > 0) {
      res.status(400).json({ error: "This draft is not ready to publish", details: issues });
      return;
    }

    const published = await prisma.$transaction(async (tx) => {
      const updated = await tx.assessmentVersion.update({
        where: { id: version.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
        include: {
          assessment: true,
          skills: { include: { skill: { include: { subskills: true } } } },
          tasks: {
            orderBy: { position: "asc" },
            include: { skill: true, rubric: { orderBy: { position: "asc" } } },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: "PUBLISH_ASSESSMENT_VERSION",
          entityType: "AssessmentVersion",
          entityId: version.id,
          metadata: JSON.stringify({
            assessmentId: version.assessmentId,
            versionNumber: version.versionNumber,
            durationMinutes: version.durationMinutes,
          }),
        },
      });

      return updated;
    });

    res.json(serializeDraft(published));
  }),
);

recruiterAssessmentsRouter.post(
  "/:assessmentId/versions/:versionId/new-version",
  asyncHandler(async (req, res) => {
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
      res.status(403).json({ error: "Recruiter role required" });
      return;
    }

    const assessmentId = routeParam(req.params.assessmentId);
    const versionId = routeParam(req.params.versionId);

    const source = await prisma.assessmentVersion.findFirst({
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

    if (!source) {
      res.status(404).json({ error: "Assessment version not found" });
      return;
    }

    if (source.status !== "PUBLISHED") {
      res.status(409).json({
        error: "A new version can only be started from a published version. This one is still a draft, so edit it directly.",
      });
      return;
    }

    const latest = await prisma.assessmentVersion.findFirst({
      where: { assessmentId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const version = await tx.assessmentVersion.create({
          data: buildVersionCopy(source, versionNumber),
          include: {
            assessment: true,
            skills: { include: { skill: { include: { subskills: true } } } },
            tasks: {
              orderBy: { position: "asc" },
              include: { skill: true, rubric: { orderBy: { position: "asc" } } },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: currentUser.id,
            action: "CREATE_ASSESSMENT_VERSION",
            entityType: "AssessmentVersion",
            entityId: version.id,
            metadata: JSON.stringify({
              assessmentId,
              fromVersionId: source.id,
              fromVersionNumber: source.versionNumber,
              versionNumber,
            }),
          },
        });

        return version;
      });

      res.status(201).json(serializeDraft(created));
    } catch (err) {
      if (err instanceof DraftValidationError) {
        res.status(409).json({ error: err.message, details: err.issues });
        return;
      }
      if (isUniqueConstraintError(err)) {
        res.status(409).json({ error: "Someone else created a new version at the same time. Reload and try again." });
        return;
      }
      throw err;
    }
  }),
);

recruiterAssessmentsRouter.get(
  "/:assessmentId/versions",
  asyncHandler(async (req, res) => {
    const currentUser = res.locals.user;
    if (!currentUser || currentUser.role !== "RECRUITER") {
      res.status(403).json({ error: "Recruiter role required" });
      return;
    }

    const assessmentId = routeParam(req.params.assessmentId);

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, ownerId: currentUser.id },
      select: { id: true, jobTitle: true, companyName: true },
    });

    if (!assessment) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }

    const versions = await prisma.assessmentVersion.findMany({
      where: { assessmentId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        title: true,
        difficulty: true,
        durationMinutes: true,
        generationMethod: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tasks: true } },
      },
    });

    res.json({
      assessment,
      versions: versions.map(({ _count, ...rest }) => ({ ...rest, taskCount: _count.tasks })),
    });
  }),
);