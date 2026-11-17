/**
 * Blueprint types for data-task assessment generation.
 * These types define the structure for building assessment tasks from data blueprints.
 */

import type { DatasetTheme, DataCheck, TableData } from "../dataTasks.js";

/**
 * Context passed to blueprint builders.
 * Contains the seed, theme, difficulty, and any AI-generated content.
 */
export interface BlueprintContext {
  seed: number;
  theme: DatasetTheme;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  aiContent?: {
    scenario: string; // 2-3 sentence business scenario
    instructions: string; // candidate-facing instructions (200-400 chars)
  };
}

/**
 * A single rubric criterion for a data-task blueprint.
 */
export interface BlueprintCriterion {
  name: string; // candidate-visible
  description: string; // candidate-visible
  maxMarks: number; // candidate-visible, 1-100
  privateGuidance: string; // evaluator-only, 5-1500 chars
}

/**
 * A complete data-task blueprint task ready for assessment generation.
 */
export interface BlueprintTask {
  type: "DATA_TASK";
  skillSlug: string;
  title: string;
  prompt: string; // includes scenario + instructions
  marks: number;
  timeMinutes: number;
  publicData: {
    table: TableData;
    checks: DataCheck[];
  };
  privateData: {
    answerKey: Record<string, number | string>;
    rubric: BlueprintCriterion[];
  };
  rubric: BlueprintCriterion[];
}

/**
 * Result of picking a theme from available themes.
 */
export interface ThemePickResult {
  theme: DatasetTheme;
  reason: string;
}

/**
 * Parameters for building a sales analysis task.
 */
export interface BuildSalesAnalysisParams {
  context: BlueprintContext;
  targetSkillSlug: string;
  marks: number;
  timeMinutes: number;
}

/**
 * Parameters for building a quantity estimation task.
 */
export interface BuildQuantityEstimationParams {
  context: BlueprintContext;
  targetSkillSlug: string;
  marks: number;
  timeMinutes: number;
}