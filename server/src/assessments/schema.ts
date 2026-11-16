import { z } from "zod";
import { ASSESSMENT_TYPES } from "../skills/assessmentTypes";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const rubricCriterionSchema = z.object({
  name: text(2, 100), // candidate-visible
  description: text(5, 500), // candidate-visible
  maxMarks: z.number().int().min(1).max(100), // candidate-visible
  privateGuidance: text(5, 1500), // evaluator-only
});

export const taskSchema = z.object({
  type: z.enum(ASSESSMENT_TYPES),
  skillSlug: text(1, 80),
  title: text(3, 120),
  prompt: text(20, 4000),
  marks: z.number().int().min(1).max(100),
  timeMinutes: z.number().int().min(1).max(240),
  // Tightened per task type in Step 4B (datasets, checks, file briefs).
  publicData: z.record(z.string(), z.unknown()).default({}),
  privateData: z.record(z.string(), z.unknown()).default({}),
  rubric: z.array(rubricCriterionSchema).min(1).max(8),
});

export const targetSkillSchema = z.object({
  skillSlug: text(1, 80),
  weight: z.number().int().min(1).max(100),
  subskills: z.array(text(2, 100)).max(8).default([]),
});

export const generatedAssessmentSchema = z
  .object({
    title: text(5, 150),
    description: text(10, 600),
    jobContext: text(10, 1200),
    candidateInstructions: text(10, 2000),
    targetSkills: z.array(targetSkillSchema).min(1).max(8),
    tasks: z.array(taskSchema).min(1).max(8),
  })
  .superRefine((a, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const slugs = new Set(a.targetSkills.map((s) => s.skillSlug));
    if (slugs.size !== a.targetSkills.length) {
      issue(["targetSkills"], "Each skill may appear only once");
    }

    const weightSum = a.targetSkills.reduce((n, s) => n + s.weight, 0);
    if (weightSum !== 100) issue(["targetSkills"], `Skill weights must add up to 100 (currently ${weightSum})`);

    const marksSum = a.tasks.reduce((n, t) => n + t.marks, 0);
    if (marksSum !== 100) issue(["tasks"], `Task marks must add up to 100 (currently ${marksSum})`);

    a.tasks.forEach((t, i) => {
      if (!slugs.has(t.skillSlug)) {
        issue(["tasks", i, "skillSlug"], `Task skill "${t.skillSlug}" is not one of the target skills`);
      }
      const rubricSum = t.rubric.reduce((n, r) => n + r.maxMarks, 0);
      if (rubricSum !== t.marks) {
        issue(["tasks", i, "rubric"], `Rubric marks (${rubricSum}) must equal the task marks (${t.marks})`);
      }
    });
  });

export type GeneratedAssessment = z.infer<typeof generatedAssessmentSchema>;
export type GeneratedTask = z.infer<typeof taskSchema>;