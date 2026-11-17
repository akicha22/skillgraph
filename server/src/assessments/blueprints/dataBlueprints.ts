/**
 * Data-task blueprint builders.
 * Builds complete assessment tasks from deterministic datasets.
 */

import {
  generateSalesDataset,
  buildSalesChecks,
  describeTrends,
  generateFootingsDataset,
  buildFootingChecks,
  computeCheck,
  type DatasetTheme,
  type DataCheck,
  type TableData,
  type CheckSpec,
} from "../dataTasks.js";
import type {
  BlueprintContext,
  BlueprintTask,
  BlueprintCriterion,
  ThemePickResult,
  BuildSalesAnalysisParams,
  BuildQuantityEstimationParams,
} from "./types.js";

/**
 * Pick a theme for the assessment.
 * Rotates themes based on seed to ensure variety.
 */
export function pickTheme(context: BlueprintContext): ThemePickResult {
  const themes: DatasetTheme[] = ["retail", "building-materials"];
  const theme = themes[context.seed % themes.length];
  return {
    theme,
    reason: `Seed ${context.seed} maps to ${theme} theme`,
  };
}

/**
 * Build a sales analysis data-task blueprint.
 */
export function buildSalesAnalysisTask({
  context,
  targetSkillSlug,
  marks,
  timeMinutes,
}: BuildSalesAnalysisParams): BlueprintTask {
  const { seed, theme, difficulty, aiContent } = context;

  // Generate deterministic dataset
  const dataset = generateSalesDataset(seed, theme);

  // Build checks from the dataset
  const checksWithExpected = buildSalesChecks(dataset);

  // Extract checks for publicData
  const checks: DataCheck[] = checksWithExpected.map((c) => c.check);

  // Build answer key for privateData
  const answerKey: Record<string, number | string> = {};
  for (const { check, expected } of checksWithExpected) {
    answerKey[check.id] = expected;
  }

  // Get declining product for rubric private guidance
  const { decliningProduct } = describeTrends(dataset);

  // Build rubric criteria: 10 marks per check + 20 for overall analysis
  const rubric: BlueprintCriterion[] = [
    ...checksWithExpected.map(({ check, expected }) => ({
      name: check.label,
      description: `Correctly answer: ${check.question}`,
      maxMarks: 10,
      privateGuidance: `Expected answer: ${check.answerType === "NUMBER" ? expectedToString(expected) : expected}. For ${check.id}: ${getPrivateGuidance(check.id, decliningProduct, difficulty)}`,
    })),
    {
      name: "Overall analysis and presentation",
      description: "Answers are clearly presented with workings shown.",
      maxMarks: 20,
      privateGuidance: "Strong answers show clear workings, label all steps, and present final answers prominently. Weak answers give only final numbers with no working, or have disorganised calculations.",
    },
  ];

  // Build prompt with scenario and instructions
  const scenario = aiContent?.scenario ?? defaultSalesScenario(theme);
  const instructions = aiContent?.instructions ?? defaultSalesInstructions();

  const prompt = `${scenario}\n\n${instructions}`;

  return {
    type: "DATA_TASK",
    skillSlug: targetSkillSlug,
    title: `Sales Analysis — ${theme === "retail" ? "Retail" : "Building Materials"}`,
    prompt,
    marks,
    timeMinutes,
    publicData: {
      table: dataset,
      checks,
    },
    privateData: {
      answerKey,
      rubric,
    },
    rubric,
    isGeneric: false,
    timeWeight: 2,
  };
}

/**
 * Build a quantity estimation (civil footings) data-task blueprint.
 */
export function buildQuantityEstimationTask({
  context,
  targetSkillSlug,
  marks,
  timeMinutes,
}: BuildQuantityEstimationParams): BlueprintTask {
  const { seed, difficulty, aiContent } = context;

  // Generate deterministic footings dataset
  const dataset = generateFootingsDataset(seed);

  // Build checks from the dataset
  const checksWithExpected = buildFootingChecks(dataset);

  // Extract checks for publicData
  const checks: DataCheck[] = checksWithExpected.map((c) => c.check);

  // Build answer key for privateData
  const answerKey: Record<string, number | string> = {};
  for (const { check, expected } of checksWithExpected) {
    answerKey[check.id] = expected;
  }

  // Build rubric criteria: 10 marks per check + 20 for overall analysis
  const rubric: BlueprintCriterion[] = [
    ...checksWithExpected.map(({ check, expected }) => ({
      name: check.label,
      description: `Correctly answer: ${check.question}`,
      maxMarks: 10,
      privateGuidance: `Expected answer: ${expectedToString(check.answerType === "NUMBER" ? expected : expected)}. For ${check.id}: ${getFootingPrivateGuidance(check.id, difficulty)}`,
    })),
    {
      name: "Overall calculation and presentation",
      description: "Calculations are clearly shown with correct units and rounding.",
      maxMarks: 20,
      privateGuidance: "Strong answers show all steps (volume = L × W × D × count), use correct units (m³), and round as specified. Weak answers skip steps, use wrong units, or have arithmetic errors.",
    },
  ];

  // Build prompt with scenario and instructions
  const scenario = aiContent?.scenario ?? defaultFootingsScenario();
  const instructions = aiContent?.instructions ?? defaultFootingsInstructions();

  const prompt = `${scenario}\n\n${instructions}`;

  return {
    type: "DATA_TASK",
    skillSlug: targetSkillSlug,
    title: "Quantity Estimation — Civil Footings",
    prompt,
    marks,
    timeMinutes,
    publicData: {
      table: dataset,
      checks,
    },
    privateData: {
      answerKey,
      rubric,
    },
    rubric,
    isGeneric: false,
    timeWeight: 2,
  };
}

/**
 * Convert expected value to string for private guidance.
 */
function expectedToString(expected: number | string): string {
  if (typeof expected === "number") {
    return expected.toFixed(2);
  }
  return expected;
}

/**
 * Get private guidance for sales analysis checks.
 */
function getPrivateGuidance(checkId: string, decliningProduct: string, difficulty: string): string {
  const baseGuidance = {
    total_revenue: "Sum of revenue column across all rows. Verify candidate's arithmetic.",
    top_product: `Product with highest total revenue. Declining product is "${decliningProduct}" — this is private rubric info, not in candidate data.`,
    growth_pct: "Percentage change from Jan to Jun revenue. Rounded to 1 decimal. Formula: ((Jun - Jan) / Jan) * 100.",
    avg_units_first_product: "Mean of units for first product in dataset. Rounded to 1 decimal tolerance.",
  };

  const difficultyNote =
    difficulty === "ADVANCED"
      ? " Expect exact calculation; no rounding tolerance."
      : difficulty === "BEGINNER"
      ? " Allow generous tolerance; focus on method."
      : " Standard tolerance applies.";

  return baseGuidance[checkId as keyof typeof baseGuidance] + difficultyNote;
}

/**
 * Get private guidance for footing checks.
 */
function getFootingPrivateGuidance(checkId: string, difficulty: string): string {
  const baseGuidance = {
    total_concrete_volume: "Sum of (length × width × depth × count) for all footings. Rounded to 3 decimals in key.",
    total_footings: "Sum of count column. Integer answer.",
    volume_f2: "Sum of (length × width × depth × count) where footing = 'F2'. Rounded to 3 decimals in key.",
  };

  const difficultyNote =
    difficulty === "ADVANCED"
      ? " Expect exact calculation to 2 decimal places."
      : difficulty === "BEGINNER"
      ? " Allow tolerance ±0.05; focus on formula application."
      : " Standard tolerance ±0.05 applies.";

  return baseGuidance[checkId as keyof typeof baseGuidance] + difficultyNote;
}

/**
 * Default scenario for sales analysis (retail theme).
 */
function defaultSalesScenario(theme: DatasetTheme): string {
  if (theme === "retail") {
    return `You are a business analyst at a retail company that sells office supplies. Your manager has asked you to analyze the first half of 2026 sales data for four product categories: Notebooks, Backpacks, Water Bottles, and Desk Lamps. The dataset contains monthly units sold and revenue for January through June 2026.`;
  }
  return `You are a procurement analyst at a construction materials supplier. Your manager has asked you to analyze the first half of 2026 sales data for four building material categories: Cement (50kg bag), TMT Steel (kg), River Sand (tonne), and Bricks (1000). The dataset contains monthly units sold and revenue for January through June 2026.`;
}

/**
 * Default instructions for sales analysis.
 */
function defaultSalesInstructions(): string {
  return `Using the data table provided, answer the following questions. Show your work for partial credit.

1. What is the total revenue across all six months?
2. Which product earned the most total revenue?
3. By what percentage did total monthly revenue change from January to June 2026? Give one decimal place.
4. What is the average monthly units sold for the first product listed in the table?`;
}

/**
 * Default scenario for quantity estimation (civil footings).
 */
function defaultFootingsScenario(): string {
  return `You are a junior quantity surveyor at a civil engineering firm. You have been given the footing schedule for a small residential project. The table shows five footing types (F1 through F5) with their dimensions in metres and the count of each footing type required. You need to calculate concrete volumes for ordering.`;
}

/**
 * Default instructions for quantity estimation.
 */
function defaultFootingsInstructions(): string {
  return `Using the footing schedule table provided, answer the following questions. Show your work for partial credit. All volumes in cubic metres (m³).

1. What is the total volume of concrete, in cubic metres, needed for all the footings? Give two decimal places.
2. How many footings are there in total?
3. What is the total concrete volume, in cubic metres, for footing type F2 only (all F2 footings together)?`;
}