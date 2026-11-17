// assembler.ts
import type { BlueprintContext, BlueprintTask, AssessmentType } from "./blueprints/types.js";
import { buildTaskForSkill, buildGenericTask, hasSpecificBlueprint, getSpecificBuilder } from "./blueprints/index.js";
import { ASSESSMENT_TYPES } from "../skills/assessmentTypes.js";
import { Level, Difficulty } from "./constants.js";
import type { DraftWording, GeneratedAssessment } from "./schema.js";
import { generatedAssessmentSchema } from "./schema.js";
import { parseRequirements } from "./requirementParser.js";

// Largest-remainder allocation so the parts always sum to `total` (no infinite loop).
// Shared with draft editing so rebalancing rules stay identical to generation.
export function allocateByWeights(total: number, weights: number[], minPerItem: number, label: string): number[] {
  const count = weights.length;
  if (count === 0) return [];
  const minTotal = count * minPerItem;
  if (total < minTotal) throw new Error(`Cannot allocate ${total} ${label} across ${count} tasks (minimum ${minTotal})`);
  const remaining = total - minTotal;
  const safeWeights = weights.map((w) => Math.max(0, w));
  const weightSum = safeWeights.reduce((s, w) => s + w, 0);
  const shares =
    weightSum === 0
      ? safeWeights.map(() => remaining / count)
      : safeWeights.map((w) => (remaining * w) / weightSum);
  const floors = shares.map((s) => Math.floor(s));
  let leftover = remaining - floors.reduce((s, n) => s + n, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const allocations = floors.map((n) => n + minPerItem);
  for (let k = 0; k < leftover; k++) {
    allocations[order[k % count].i] += 1;
  }
  return allocations;
}

function allocateMarks(total: number, weights: number[], minPerItem: number = 1): number[] {
  return allocateByWeights(total, weights, minPerItem, "marks");
}

function allocateDuration(totalMinutes: number, tasks: BlueprintTask[]): number[] {
  const weights = tasks.map((t) => (t.marks ?? 0) * (t.timeWeight ?? 1));
  return allocateByWeights(totalMinutes, weights, 1, "minutes");
}

// Normalize rubric marks to match task marks
function normalizeRubric(task: BlueprintTask, taskMarks: number): void {
  if (!task.rubric || task.rubric.length === 0) return;
  const originalSum = task.rubric.reduce((s, c) => s + c.maxMarks, 0);
  if (originalSum === 0) return;
  const scale = taskMarks / originalSum;
  const newRubric = task.rubric.map((c) => ({
    ...c,
    maxMarks: Math.round(c.maxMarks * scale),
  }));
  const newSum = newRubric.reduce((s, c) => s + c.maxMarks, 0);
  if (newSum !== taskMarks) {
    const diff = taskMarks - newSum;
    if (diff !== 0) {
      newRubric[newRubric.length - 1].maxMarks += diff;
    }
  }
  task.rubric = newRubric;

  if (task.type === "DATA_TASK" && task.publicData?.checks) {
    const checks = task.publicData.checks as Array<{ marks?: number }>;
    const totalCheckMarks = checks.reduce((s, c) => s + (c.marks ?? 0), 0);
    if (totalCheckMarks > 0) {
      const checkScale = (taskMarks / originalSum) * totalCheckMarks;
      checks.forEach((c) => {
        if (c.marks) c.marks = Math.round(c.marks * (checkScale / totalCheckMarks));
      });
    }
  }

  if (task.privateData?.rubric) {
    const privateRubric = task.privateData.rubric as Array<{ maxMarks?: number }>;
    const totalPrivate = privateRubric.reduce((s, c) => s + (c.maxMarks ?? 0), 0);
    if (totalPrivate > 0) {
      privateRubric.forEach((c) => {
        if (c.maxMarks) c.maxMarks = Math.round(c.maxMarks * (taskMarks / originalSum));
      });
    }
  }
}

// Convert blueprint DATA_TASK to database DATA_ANALYTICAL
function convertAssessmentType(type: string): string {
  if (type === "DATA_TASK") return "DATA_ANALYTICAL";
  return type;
}

const MAX_PROMPT_LENGTH = 4000;

// Applies wording overrides to a task. The coded prompt (and therefore every fact it
// carries) is kept; only the title and a short framing paragraph can change.
function applyTaskWording(task: BlueprintTask, wording: { title?: string; brief: string }): void {
  if (wording.title) task.title = wording.title;
  const brief = wording.brief.trim();
  if (!brief) return;
  if (brief.length + 2 + task.prompt.length > MAX_PROMPT_LENGTH) return;
  task.prompt = `${brief}\n\n${task.prompt}`;
}

// Main assembler function
export async function assembleAssessment(
  config: {
    requirementsText: string;
    jobTitle?: string;
    companyName: string;
    description?: string;
    targetLevel?: Level;
    difficulty?: Difficulty;
    durationMinutes?: number;
    taskCount?: number;
    preferredAssessmentTypes?: string[];
    aiPolicy: "NOT_ALLOWED" | "ALLOWED_DISCLOSED";
    targetSkills: Array<{ skillSlug: string; weight: number; subskills: string[]; source: "REQUESTED" | "SUGGESTED_APPROVED" }>;
    /** Fixes the blueprint seed so two passes produce identical facts. */
    seed?: number;
    /** Wording-only overrides (AI or editor); never affects marks, rubrics or answer keys. */
    aiWording?: DraftWording;
  },
  prisma: any // Prisma client
): Promise<GeneratedAssessment> {
  const weightSum = config.targetSkills.reduce((s, skill) => s + skill.weight, 0);
  if (weightSum !== 100) {
    throw new Error(`Skill weights must add up to exactly 100 (currently ${weightSum})`);
  }

  // 1. Resolve skills and subskills from database
  const skillSlugs = config.targetSkills.map((s) => s.skillSlug);
  const skills = await prisma.skill.findMany({
    where: { slug: { in: skillSlugs } },
    include: { subskills: true },
  });
  if (skills.length !== skillSlugs.length) {
    const missing = skillSlugs.filter((s) => !skills.find((sk: { slug: string }) => sk.slug === s));
    throw new Error(`Missing skills in database: ${missing.join(", ")}`);
  }
  const skillMap = new Map<string, { slug: string; name: string; assessmentTypes: string }>(skills.map((sk: { slug: string; name: string; assessmentTypes: string }) => [sk.slug, { slug: sk.slug, name: sk.name, assessmentTypes: sk.assessmentTypes }]));

  // 2. Determine defaults from requirements if not provided
  const parsed = await parseRequirements(config.requirementsText, skills);
  const finalConfig = {
    ...config,
    jobTitle: config.jobTitle ?? parsed.jobTitle,
    targetLevel: config.targetLevel ?? parsed.targetLevel ?? "FRESHER",
    difficulty: config.difficulty ?? parsed.difficulty ?? "INTERMEDIATE",
    durationMinutes: config.durationMinutes ?? parsed.durationMinutes ?? 45,
    taskCount: config.taskCount ?? parsed.taskCount ?? config.targetSkills.length,
  };

  // 3. Validate taskCount vs skill count
  if (finalConfig.taskCount < finalConfig.targetSkills.length) {
    throw new Error("Task count cannot be lower than the number of selected skills");
  }

  // 4. Build blueprint context
  const seed = config.seed ?? Date.now();
  const ctx: BlueprintContext = {
    seed,
    theme: "retail",
    difficulty: finalConfig.difficulty,
    aiContent: {
      scenario: `${finalConfig.jobTitle} at ${finalConfig.companyName}. ${finalConfig.description || ""}`,
      instructions: "Complete the tasks below to demonstrate your skills.",
    },
    jobTitle: finalConfig.jobTitle ?? undefined,
    companyName: finalConfig.companyName,
  };

  // 5. For each skill, determine assessment type (respect preferred list)
  const skillTypes: Record<string, AssessmentType> = {};
  const supportedTypes = (skill: { assessmentTypes: string }): AssessmentType[] => {
    const types = skill.assessmentTypes.split(",").map((t: string) => t.trim());
    return types.map((t) => t === "DATA_ANALYTICAL" ? "DATA_TASK" as AssessmentType : t as AssessmentType);
  };
  finalConfig.targetSkills.forEach((s) => {
    const skill = skillMap.get(s.skillSlug);
    if (!skill) throw new Error(`Skill ${s.skillSlug} not found`);
    const skillAssessmentTypes = supportedTypes(skill);
    const preferred = finalConfig.preferredAssessmentTypes?.find((t: string) => skillAssessmentTypes.includes(t as any));
    skillTypes[s.skillSlug] = (preferred ?? skillAssessmentTypes?.[0] ?? "STRUCTURED_RESPONSE") as AssessmentType;
  });

  // 6. Build tasks with deterministic distribution
  const tasks: BlueprintTask[] = [];
  const skillWeights = finalConfig.targetSkills.map((s) => s.weight);
  const taskCountsPerSkill = allocateMarks(finalConfig.taskCount, skillWeights, 1);

  for (let i = 0; i < finalConfig.targetSkills.length; i++) {
    const skillConfig = finalConfig.targetSkills[i];
    const skill = skillMap.get(skillConfig.skillSlug);
    if (!skill) continue;
    const count = taskCountsPerSkill[i];
    const assessmentTypes = skill?.assessmentTypes?.split(",").map((t: string) => t.trim()) as AssessmentType[] || [];
    const skillCtx: BlueprintContext = {
      ...ctx,
      skillSlug: skill?.slug,
      skillName: skill?.name,
      skill: assessmentTypes.length > 0 ? { assessmentTypes: assessmentTypes as AssessmentType[] } : {},
    };
    const desiredType = skillTypes[skillConfig.skillSlug];

    // Try specific blueprint first if available
    let builderTask: BlueprintTask | null = null;
    if (hasSpecificBlueprint(skill.slug)) {
      const builder = getSpecificBuilder(skill.slug);
      if (builder) builderTask = builder(skillCtx);
    }
    // If specific blueprint doesn't match desired type or unavailable, use generic
    if (!builderTask || builderTask.type !== desiredType) {
      skillCtx.skill = { ...skillCtx.skill, assessmentTypes: [desiredType] };
      builderTask = buildGenericTask(skillCtx);
    }
    // Generate multiple tasks for this skill with different seeds
    for (let t = 0; t < count; t++) {
      const taskSeed = seed + i * 100 + t;
      const taskClone = JSON.parse(JSON.stringify(builderTask)) as BlueprintTask;
      taskClone.publicData = { ...taskClone.publicData };
      taskClone.privateData = { ...taskClone.privateData };
      const taskCtx = { ...skillCtx, seed: taskSeed };
      if (count > 1 && taskClone.title?.includes(":")) {
        const base = taskClone.title.split(":")[0];
        taskClone.title = `${base}: task ${t + 1}`;
      }
      const wording = config.aiWording?.tasks.find((w) => w.skillSlug === skillConfig.skillSlug);
      if (wording) applyTaskWording(taskClone, wording);
      tasks.push(taskClone);
    }
  }

  // 7. Allocate marks to skills and then to tasks
  const skillMarkAllocations = allocateMarks(100, skillWeights);
  finalConfig.targetSkills.forEach((s: { skillSlug: string }, i: number) => {
    const marks = skillMarkAllocations[i];
    const skillTasks = tasks.filter((t: BlueprintTask) => t.skillSlug === s.skillSlug);
    if (skillTasks.length === 0) return;
    const taskMarks = allocateMarks(marks, new Array(skillTasks.length).fill(1), 1);
    skillTasks.forEach((t, j) => {
      t.marks = taskMarks[j];
    });
  });

  // 8. Allocate duration minutes
  const durationAllocations = allocateDuration(finalConfig.durationMinutes, tasks);
  tasks.forEach((t, i) => {
    t.timeMinutes = durationAllocations[i];
  });

  // 9. Normalise rubrics and convert assessment types
  tasks.forEach((t) => {
    const finalMarks = t.marks ?? 100;
    normalizeRubric(t, finalMarks);
    t.type = convertAssessmentType(t.type) as AssessmentType;
    // Clean up internal fields from the blueprint task
    if ("isGeneric" in t) (t as any).isGeneric = undefined;
    if ("timeWeight" in t) (t as any).timeWeight = undefined;
  });

  // 10. Build final assessment
  const wording = config.aiWording;
  const assessment: GeneratedAssessment = {
    title:
      wording?.title ?? (finalConfig.jobTitle ? `${finalConfig.jobTitle} Assessment` : "Skills Assessment"),
    description:
      wording?.description ??
      (finalConfig.description && finalConfig.description.trim().length >= 10
        ? finalConfig.description
        : "Assessment generated from the stated job requirements."),
    jobContext:
      wording?.jobContext ??
      (finalConfig.companyName
        ? `Company: ${finalConfig.companyName}. Complete the tasks in this workplace context.`
        : "Complete the tasks in the stated workplace context."),
    candidateInstructions:
      wording?.candidateInstructions ??
      "Complete all tasks within the given time. Your responses will be evaluated using the rubrics provided.",
    targetSkills: finalConfig.targetSkills.map((s) => ({
      skillSlug: s.skillSlug,
      weight: s.weight,
      subskills: s.subskills,
    })),
    tasks: tasks.map((t) => ({
      type: t.type as any,
      skillSlug: t.skillSlug,
      title: t.title,
      prompt: t.prompt,
      marks: t.marks,
      timeMinutes: t.timeMinutes,
      publicData: t.publicData,
      privateData: t.privateData,
      rubric: t.rubric,
    })),
  };

  // 11. Validate against schema
  const validation = generatedAssessmentSchema.safeParse(assessment);
  if (!validation.success) {
    throw new Error("Assembled assessment failed validation: " + JSON.stringify(validation.error.issues));
  }

  return assessment;
}