/**
 * Blueprint types for all assessment generation.
 * These types define the structure for building assessment tasks from blueprints.
 */

import type { DatasetTheme, DataCheck, TableData } from "../dataTasks.js";

/**
 * Assessment types supported by blueprints.
 */
export type AssessmentType = "DATA_TASK" | "STRUCTURED_RESPONSE" | "FILE_SUBMISSION";

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
  skillSlug?: string;
  skillName?: string;
  jobTitle?: string;
  companyName?: string;
  /** The recruiter's own brief, used to derive concrete scenario facts. */
  requirementsText?: string;
  level?: string;
  skill?: {
    assessmentTypes?: AssessmentType[];
  };
}

/**
 * A single rubric criterion for any blueprint.
 */
export interface BlueprintCriterion {
  name: string; // candidate-visible
  description: string; // candidate-visible
  maxMarks: number; // candidate-visible, 1-100
  privateGuidance: string; // evaluator-only, 5-1500 chars
}

/**
 * Base blueprint task with common fields.
 */
export interface BaseBlueprintTask {
  type: AssessmentType;
  skillSlug: string;
  title: string;
  prompt: string;
  marks: number;
  timeMinutes: number;
  publicData: Record<string, unknown>;
  privateData: Record<string, unknown>;
  rubric: BlueprintCriterion[];
  isGeneric: boolean;
  timeWeight: number;
}

/**
 * DATA_TASK blueprint task.
 */
export interface DataTaskBlueprint extends BaseBlueprintTask {
  type: "DATA_TASK";
  publicData: {
    table: TableData;
    checks: DataCheck[];
  };
  privateData: {
    answerKey: Record<string, number | string>;
    rubric: BlueprintCriterion[];
  };
}

/**
 * STRUCTURED_RESPONSE blueprint task.
 */
export interface StructuredResponseBlueprint extends BaseBlueprintTask {
  type: "STRUCTURED_RESPONSE";
  publicData: {
    scenario?: Record<string, unknown>;
    clientMessage?: string;
    wordLimit?: number;
    deliverable?: string;
    extracts?: Array<{
      sheet: string;
      title: string;
      notes: string[];
    }>;
    instructions?: string;
    sections?: string[];
    [key: string]: unknown;
  };
  privateData: {
    evaluation: "RUBRIC_REVIEW";
    keyFacts?: string[];
    redFlags?: string[];
    strongAnswerSignals?: string[];
    plantedDiscrepancies?: Array<{
      topic: string;
      sheets: string[];
      values: (number | string)[];
    }>;
    consistentItems?: string[];
    generic?: boolean;
    [key: string]: unknown;
  };
}

/**
 * FILE_SUBMISSION blueprint task.
 */
export interface FileSubmissionBlueprint extends BaseBlueprintTask {
  type: "FILE_SUBMISSION";
  publicData: {
    brief: string;
    requirements: string[];
    deliverables: Array<{ label: string; accept: string[] }>;
    maxFileMB: number;
    evaluationNote: string;
  };
  privateData: {
    evaluation: "HUMAN_REVIEW";
    reviewChecklist?: string[];
    expected?: Record<string, unknown>;
    generic?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Union type for all blueprint tasks.
 */
export type BlueprintTask = DataTaskBlueprint | StructuredResponseBlueprint | FileSubmissionBlueprint;

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