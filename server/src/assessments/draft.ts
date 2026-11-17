/**
 * Draft editing for recruiter assessment versions (4D-1).
 *
 * Only content a recruiter can judge is editable: wording, marks, per-task minutes,
 * rubric criteria and skill weights. Task structure, datasets and answer keys stay
 * code-owned, so editing a draft can never break objective scoring.
 */

import { z } from "zod";
import { AI_POLICIES, DIFFICULTIES, LEVELS, MAX_DURATION, MAX_TASKS, MIN_DURATION } from "./constants";
import { allocateByWeights } from "./assembler";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const criterionPatchSchema = z
  .object({
    name: text(2, 100),
    description: text(5, 500),
    maxMarks: z.number().int().min(1).max(100),
    privateGuidance: text(5, 1500),
  })
  .strict();

const taskPatchSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: text(3, 120),
    prompt: text(20, 4000),
    marks: z.number().int().min(1).max(100),
    timeMinutes: z.number().int().min(1).max(240),
    // Omit to keep the existing rubric, rebalanced to the new marks.
    rubric: z.array(criterionPatchSchema).min(1).max(8).optional(),
  })
  .strict();

const skillPatchSchema = z
  .object({
    skillSlug: z.string().min(1).max(80),
    weight: z.number().int().min(1).max(100),
    subskills: z.array(text(2, 100)).max(8).optional(),
  })
  .strict();

export const draftUpdateSchema = z
  .object({
    title: text(5, 150).optional(),
    description: text(10, 600).optional(),
    jobContext: text(10, 1200).optional(),
    candidateInstructions: text(10, 2000).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    targetLevel: z.enum(LEVELS).optional(),
    aiPolicy: z.enum(AI_POLICIES).optional(),
    durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION).optional(),
    skills: z.array(skillPatchSchema).min(1).max(MAX_TASKS).optional(),
    tasks: z.array(taskPatchSchema).min(1).max(MAX_TASKS).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Send at least one field to update" });

export type DraftUpdate = z.infer<typeof draftUpdateSchema>;

export type DraftIssue = { field: string; message: string };

export class DraftValidationError extends Error {
  readonly issues: DraftIssue[];

  constructor(issues: DraftIssue[]) {
    super(issues[0]?.message ?? "Draft update is invalid");
    this.name = "DraftValidationError";
    this.issues = issues;
  }
}

export type DraftCriterion = {
  name: string;
  description: string;
  maxMarks: number;
  privateGuidance: string;
};

type DraftSkill = {
  skillId: string;
  weight: number;
  source: string;
  selectedSubskills: string;
  skill: { slug: string; name: string; subskills: { slug: string; name: string }[] };
};

type DraftTask = {
  id: string;
  position: number;
  type: string;
  title: string;
  prompt: string;
  marks: number;
  timeMinutes: number;
  publicData: string;
  privateData: string;
  skill: { slug: string; name: string };
  rubric: (DraftCriterion & { position: number })[];
};

/** Shape of the Prisma result the routes load (include: assessment, skills.skill.subskills, tasks.rubric). */
export type DraftVersionRecord = {
  id: string;
  assessmentId: string;
  versionNumber: number;
  status: string;
  requirementsText: string;
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  aiPolicy: string;
  durationMinutes: number;
  generationMethod: string;
  generationModel: string | null;
  generatedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assessment: { id: string; jobTitle: string; companyName: string };
  skills: DraftSkill[];
  tasks: DraftTask[];
};

export type DraftPlan = {
  /** Scalar fields to write; durationMinutes is always the derived total. */
  version: {
    title?: string;
    description?: string;
    jobContext?: string;
    candidateInstructions?: string;
    difficulty?: string;
    targetLevel?: string;
    aiPolicy?: string;
    durationMinutes: number;
  };
  skills?: { skillId: string; weight: number; selectedSubskills: string }[];
  tasks?: { id: string; title: string; prompt: string; marks: number; timeMinutes: number; rubric: DraftCriterion[] }[];
  changed: string[];
};

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function parseSelectedSubskills(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * Rescales rubric criteria to a new task mark total, keeping their relative weight.
 * Used when marks change but the recruiter did not rewrite the rubric.
 */
export function scaleRubric(current: DraftCriterion[], targetMarks: number): DraftCriterion[] {
  if (current.length === 0) return current;
  if (targetMarks < current.length) return current;
  const allocated = allocateByWeights(
    targetMarks,
    current.map((c) => Math.max(1, c.maxMarks)),
    1,
    "marks",
  );
  return current.map((criterion, i) => ({ ...criterion, maxMarks: allocated[i] ?? 1 }));
}

function currentTaskTotal(tasks: DraftTask[]): number {
  return tasks.reduce((sum, task) => sum + task.timeMinutes, 0);
}

/**
 * Validates a draft update against the version and returns exactly what to write.
 * Throws DraftValidationError with per-field issues when the update would leave the
 * assessment inconsistent (weights not 100, marks not 100, rubric not matching marks,
 * unknown skills, missing tasks, impossible timings).
 */
export function planDraftUpdate(current: DraftVersionRecord, update: DraftUpdate): DraftPlan {
  const issues: DraftIssue[] = [];
  const changed = Object.keys(update);

  // ---------- skills: weights and subskills only; the skill set is fixed ----------
  let skills: DraftPlan["skills"];
  if (update.skills) {
    const bySlug = new Map(current.skills.map((row) => [row.skill.slug, row]));
    const seen = new Set<string>();
    const planned: NonNullable<DraftPlan["skills"]> = [];

    for (const patch of update.skills) {
      const row = bySlug.get(patch.skillSlug);
      if (!row) {
        issues.push({
          field: `skills.${patch.skillSlug}`,
          message: `"${patch.skillSlug}" is not a skill in this draft. Skills can only be added by generating a new draft.`,
        });
        continue;
      }
      if (seen.has(patch.skillSlug)) {
        issues.push({ field: `skills.${patch.skillSlug}`, message: "Each skill may appear only once." });
        continue;
      }
      seen.add(patch.skillSlug);

      const subskills = patch.subskills ?? parseSelectedSubskills(row.selectedSubskills);
      const allowed = new Set(row.skill.subskills.map((sub) => sub.slug));
      const unknown = subskills.filter((slug) => !allowed.has(slug));
      if (unknown.length > 0) {
        issues.push({
          field: `skills.${patch.skillSlug}.subskills`,
          message: `Unknown subskill(s) for ${row.skill.name}: ${unknown.join(", ")}.`,
        });
        continue;
      }

      planned.push({ skillId: row.skillId, weight: patch.weight, selectedSubskills: JSON.stringify(subskills) });
    }

    const missing = current.skills.filter((row) => !seen.has(row.skill.slug));
    if (missing.length > 0) {
      issues.push({
        field: "skills",
        message: `Every skill in the draft needs a weight. Missing: ${missing.map((row) => row.skill.slug).join(", ")}.`,
      });
    }

    const weightSum = update.skills.reduce((sum, skill) => sum + skill.weight, 0);
    if (weightSum !== 100) {
      issues.push({ field: "skills", message: `Skill weights must add up to 100 (currently ${weightSum}).` });
    }

    skills = planned;
  }

  // ---------- tasks: existing tasks only, marks and minutes rebalanced to 100 ----------
  let tasks: DraftPlan["tasks"];
  if (update.tasks) {
    const byId = new Map(current.tasks.map((task) => [task.id, task]));
    const seen = new Set<string>();
    const plannedById = new Map<string, NonNullable<DraftPlan["tasks"]>[number]>();
    let marksSum = 0;

    for (const patch of update.tasks) {
      const row = byId.get(patch.id);
      if (!row) {
        issues.push({
          field: `tasks.${patch.id}`,
          message: "That task is not part of this draft. Tasks can only be added by generating a new draft.",
        });
        continue;
      }
      if (seen.has(patch.id)) {
        issues.push({ field: `tasks.${patch.id}`, message: "Each task may appear only once." });
        continue;
      }
      seen.add(patch.id);

      const rubric = patch.rubric ?? scaleRubric(row.rubric, patch.marks);
      const rubricSum = rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
      if (rubricSum !== patch.marks) {
        issues.push({
          field: `tasks.${patch.id}.rubric`,
          message: `Rubric marks (${rubricSum}) must equal the task marks (${patch.marks}) for "${patch.title}".`,
        });
      }

      marksSum += patch.marks;
      plannedById.set(patch.id, {
        id: patch.id,
        title: patch.title,
        prompt: patch.prompt,
        marks: patch.marks,
        timeMinutes: patch.timeMinutes,
        rubric: rubric.map((criterion) => ({
          name: criterion.name,
          description: criterion.description,
          maxMarks: criterion.maxMarks,
          privateGuidance: criterion.privateGuidance,
        })),
      });
    }

    const missing = current.tasks.filter((task) => !seen.has(task.id));
    if (missing.length > 0) {
      issues.push({
        field: "tasks",
        message: `Every task must be included in the update. Missing: ${missing.map((task) => task.id).join(", ")}.`,
      });
    }

    if (marksSum !== 100) {
      issues.push({ field: "tasks", message: `Task marks must add up to 100 (currently ${marksSum}).` });
    }

    // Preserve the original task order.
    tasks = current.tasks
      .map((task) => plannedById.get(task.id))
      .filter((task): task is NonNullable<DraftPlan["tasks"]>[number] => Boolean(task));
  }

  // ---------- duration: always the sum of task times ----------
  let durationMinutes = currentTaskTotal(current.tasks);

  if (tasks) {
    durationMinutes = tasks.reduce((sum, task) => sum + task.timeMinutes, 0);
    if (durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION) {
      issues.push({
        field: "tasks",
        message: `Total time must be between ${MIN_DURATION} and ${MAX_DURATION} minutes (currently ${durationMinutes}).`,
      });
    }
    if (update.durationMinutes !== undefined && update.durationMinutes !== durationMinutes) {
      issues.push({
        field: "durationMinutes",
        message: `Task times add up to ${durationMinutes} minutes. Change the task times to change the total.`,
      });
    }
  } else if (update.durationMinutes !== undefined && update.durationMinutes !== durationMinutes) {
    if (update.durationMinutes < current.tasks.length) {
      issues.push({
        field: "durationMinutes",
        message: `The assessment has ${current.tasks.length} tasks, so it needs at least ${current.tasks.length} minutes.`,
      });
    } else {
      const allocated = allocateByWeights(
        update.durationMinutes,
        current.tasks.map((task) => task.timeMinutes),
        1,
        "minutes",
      );
      tasks = current.tasks.map((task, i) => ({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        marks: task.marks,
        timeMinutes: allocated[i] ?? 1,
        rubric: task.rubric.map(({ position: _position, ...criterion }) => criterion),
      }));
      durationMinutes = update.durationMinutes;
      // Redistribution rewrites task minutes too, so the audit entry must reflect that.
      if (!changed.includes("tasks")) changed.push("tasks");
    }
  }

  if (issues.length > 0) throw new DraftValidationError(issues);

  return {
    version: {
      title: update.title,
      description: update.description,
      jobContext: update.jobContext,
      candidateInstructions: update.candidateInstructions,
      difficulty: update.difficulty,
      targetLevel: update.targetLevel,
      aiPolicy: update.aiPolicy,
      durationMinutes,
    },
    skills,
    tasks,
    changed,
  };
}

/**
 * Everything that must be true before a draft can become an immutable published version.
 * Publishing is the last moment criteria can change, so the whole draft is re-checked.
 */
export function publishIssues(version: DraftVersionRecord): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (version.skills.length === 0) {
    issues.push({ field: "skills", message: "This draft has no skills, so it cannot be scored." });
  } else {
    const weights = version.skills.reduce((sum, row) => sum + row.weight, 0);
    if (weights !== 100) {
      issues.push({ field: "skills", message: `Skill weights must add up to 100 (currently ${weights}).` });
    }
  }

  if (version.tasks.length === 0) {
    issues.push({ field: "tasks", message: "This draft has no tasks." });
  } else {
    const marks = version.tasks.reduce((sum, task) => sum + task.marks, 0);
    if (marks !== 100) {
      issues.push({ field: "tasks", message: `Task marks must add up to 100 (currently ${marks}).` });
    }

    const minutes = currentTaskTotal(version.tasks);
    if (minutes < MIN_DURATION || minutes > MAX_DURATION) {
      issues.push({
        field: "tasks",
        message: `Total time must be between ${MIN_DURATION} and ${MAX_DURATION} minutes (currently ${minutes}).`,
      });
    }
  }

  const selected = new Set(version.skills.map((row) => row.skill.slug));
  for (const task of version.tasks) {
    if (!selected.has(task.skill.slug)) {
      issues.push({
        field: `tasks.${task.id}`,
        message: `Task "${task.title}" uses ${task.skill.slug}, which is not one of this draft's skills.`,
      });
    }
    if (task.prompt.trim().length < 20) {
      issues.push({
        field: `tasks.${task.id}.prompt`,
        message: `Task "${task.title}" needs candidate instructions of at least 20 characters.`,
      });
    }
    if (task.rubric.length === 0) {
      issues.push({ field: `tasks.${task.id}.rubric`, message: `Task "${task.title}" has no rubric criteria.` });
      continue;
    }
    const rubricSum = task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
    if (rubricSum !== task.marks) {
      issues.push({
        field: `tasks.${task.id}.rubric`,
        message: `Rubric marks (${rubricSum}) must equal the task marks (${task.marks}) for "${task.title}".`,
      });
    }
  }

  return issues;
}

export type VersionCopyData = {
  assessmentId: string;
  versionNumber: number;
  status: string;
  requirementsText: string;
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  durationMinutes: number;
  aiPolicy: string;
  generationMethod: string;
  generationModel: string | null;
  generatedAt: Date;
  skills: { create: { skillId: string; weight: number; source: string; selectedSubskills: string }[] };
  tasks: {
    create: {
      position: number;
      type: string;
      skillId: string;
      title: string;
      prompt: string;
      marks: number;
      timeMinutes: number;
      publicData: string;
      privateData: string;
      rubric: { create: Array<DraftCriterion & { position: number }> };
    }[];
  };
};

/**
 * Builds a brand-new DRAFT version from a published one. Content is copied exactly
 * (including answer keys), so the new draft starts from what candidates were assessed on.
 */
export function buildVersionCopy(
  source: DraftVersionRecord,
  versionNumber: number,
  now: () => Date = () => new Date(),
): VersionCopyData {
  const skillIdBySlug = new Map(source.skills.map((row) => [row.skill.slug, row.skillId]));

  return {
    assessmentId: source.assessmentId,
    versionNumber,
    status: "DRAFT",
    requirementsText: source.requirementsText,
    title: source.title,
    description: source.description,
    jobContext: source.jobContext,
    candidateInstructions: source.candidateInstructions,
    targetLevel: source.targetLevel,
    difficulty: source.difficulty,
    durationMinutes: source.durationMinutes,
    aiPolicy: source.aiPolicy,
    generationMethod: source.generationMethod,
    generationModel: source.generationModel,
    generatedAt: now(),
    skills: {
      create: source.skills.map((row) => ({
        skillId: row.skillId,
        weight: row.weight,
        source: row.source,
        selectedSubskills: row.selectedSubskills,
      })),
    },
    tasks: {
      create: source.tasks.map((task, position) => {
        const skillId = skillIdBySlug.get(task.skill.slug);
        if (!skillId) {
          throw new DraftValidationError([
            {
              field: `tasks.${task.id}`,
              message: `Task "${task.title}" uses ${task.skill.slug}, which is not part of this version.`,
            },
          ]);
        }
        return {
          position,
          type: task.type,
          skillId,
          title: task.title,
          prompt: task.prompt,
          marks: task.marks,
          timeMinutes: task.timeMinutes,
          publicData: task.publicData,
          privateData: task.privateData,
          rubric: {
            create: task.rubric.map((criterion, i) => ({
              position: i,
              name: criterion.name,
              description: criterion.description,
              maxMarks: criterion.maxMarks,
              privateGuidance: criterion.privateGuidance,
            })),
          },
        };
      }),
    },
  };
}

export type SerializedDraft = {
  id: string;
  assessmentId: string;
  versionNumber: number;
  status: string;
  editable: boolean;
  requirementsText: string;
  title: string;
  description: string;
  jobContext: string;
  candidateInstructions: string;
  targetLevel: string;
  difficulty: string;
  aiPolicy: string;
  durationMinutes: number;
  generationMethod: string;
  generationModel: string | null;
  generatedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assessment: { id: string; jobTitle: string; companyName: string };
  skills: {
    skillSlug: string;
    name: string;
    weight: number;
    source: string;
    subskills: { slug: string; name: string }[];
  }[];
  tasks: {
    id: string;
    position: number;
    type: string;
    skillSlug: string;
    skillName: string;
    title: string;
    prompt: string;
    marks: number;
    timeMinutes: number;
    publicData: Record<string, unknown>;
    privateData: Record<string, unknown>;
    rubric: { position: number; name: string; description: string; maxMarks: number; privateGuidance: string }[];
  }[];
  totals: { marks: number; weights: number; durationMinutes: number; taskCount: number };
};

/**
 * Shapes a draft for the recruiter UI. Includes private rubric guidance and answer keys:
 * this response is only ever produced for the recruiter who owns the assessment.
 */
export function serializeDraft(version: DraftVersionRecord): SerializedDraft {
  const subskillName = (skill: DraftSkill, slug: string) =>
    skill.skill.subskills.find((sub) => sub.slug === slug)?.name ?? slug;

  return {
    id: version.id,
    assessmentId: version.assessmentId,
    versionNumber: version.versionNumber,
    status: version.status,
    editable: version.status === "DRAFT",
    requirementsText: version.requirementsText,
    title: version.title,
    description: version.description,
    jobContext: version.jobContext,
    candidateInstructions: version.candidateInstructions,
    targetLevel: version.targetLevel,
    difficulty: version.difficulty,
    aiPolicy: version.aiPolicy,
    durationMinutes: version.durationMinutes,
    generationMethod: version.generationMethod,
    generationModel: version.generationModel,
    generatedAt: version.generatedAt,
    publishedAt: version.publishedAt,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    assessment: {
      id: version.assessment.id,
      jobTitle: version.assessment.jobTitle,
      companyName: version.assessment.companyName,
    },
    skills: version.skills.map((row) => ({
      skillSlug: row.skill.slug,
      name: row.skill.name,
      weight: row.weight,
      source: row.source,
      subskills: parseSelectedSubskills(row.selectedSubskills).map((slug) => ({
        slug,
        name: subskillName(row, slug),
      })),
    })),
    tasks: version.tasks.map((task) => ({
      id: task.id,
      position: task.position,
      type: task.type,
      skillSlug: task.skill.slug,
      skillName: task.skill.name,
      title: task.title,
      prompt: task.prompt,
      marks: task.marks,
      timeMinutes: task.timeMinutes,
      publicData: parseJsonObject(task.publicData),
      privateData: parseJsonObject(task.privateData),
      rubric: task.rubric.map((criterion) => ({
        position: criterion.position,
        name: criterion.name,
        description: criterion.description,
        maxMarks: criterion.maxMarks,
        privateGuidance: criterion.privateGuidance,
      })),
    })),
    totals: {
      marks: version.tasks.reduce((sum, task) => sum + task.marks, 0),
      weights: version.skills.reduce((sum, row) => sum + row.weight, 0),
      durationMinutes: version.tasks.reduce((sum, task) => sum + task.timeMinutes, 0),
      taskCount: version.tasks.length,
    },
  };
}
