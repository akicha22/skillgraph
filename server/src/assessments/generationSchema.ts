// generationSchema.ts
import { z } from "zod";
import { ASSESSMENT_TYPES } from "../skills/assessmentTypes";

import { LEVELS, DIFFICULTIES } from "./constants";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

// Skill sub-selection
const skillSchema = z.object({
  skillSlug: z.string().min(1).max(80),
  weight: z.number().int().min(1).max(100),
  subskills: z.array(z.string().min(2).max(100)).max(8).default([]),
  source: z.enum(["REQUESTED", "SUGGESTED_APPROVED"]),
});

export const generationSchema = z.object({
  // Natural language requirements
  requirementsText: text(10, 3000),
  // Optional structured fields (may be extracted from requirements)
  jobTitle: z.string().min(1).max(100).optional(),
  companyName: z.string().min(1).max(100),
  description: text(5, 600).optional(),
  // Assessment configuration
  targetLevel: z.enum(LEVELS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  durationMinutes: z.number().int().min(10).max(240).optional(),
  taskCount: z.number().int().min(1).max(8).optional(),
  preferredAssessmentTypes: z
    .array(z.enum(ASSESSMENT_TYPES))
    .max(3)
    .optional(),
  aiPolicy: z.enum(["NOT_ALLOWED", "ALLOWED_DISCLOSED"]).default("NOT_ALLOWED"),
  // Selected skills with weights and subskills
  targetSkills: z.array(skillSchema).min(1).max(8),
});

// Post-validation refinements
export const generationSchemaWithRefinements = generationSchema.superRefine((data, ctx) => {
  // Skill weight sum must be exactly 100
  const weightSum = data.targetSkills.reduce((sum, s) => sum + s.weight, 0);
  if (weightSum !== 100) {
    ctx.addIssue({ code: "custom", path: ["targetSkills"], message: `Skill weights must add up to exactly 100 (currently ${weightSum})` });
  }

  // No duplicate skill slugs
  const slugs = new Set(data.targetSkills.map((s) => s.skillSlug));
  if (slugs.size !== data.targetSkills.length) {
    ctx.addIssue({ code: "custom", path: ["targetSkills"], message: "Each skill may appear only once" });
  }

  // Task count must be at least number of selected skills
  if (data.taskCount && data.taskCount < data.targetSkills.length) {
    ctx.addIssue({ code: "custom", path: ["taskCount"], message: "Task count cannot be lower than the number of selected skills" });
  }

  // Validate subskills belong to parent skill (will be checked in assembler)
});