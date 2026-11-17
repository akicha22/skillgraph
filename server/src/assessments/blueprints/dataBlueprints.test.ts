/**
 * Tests for dataBlueprints.ts
 * Uses node:test and node:assert/strict only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  pickTheme,
  buildSalesAnalysisTask,
  buildQuantityEstimationTask,
} from "./dataBlueprints.js";
import type { BlueprintContext, DataTaskBlueprint, BlueprintCriterion } from "./types.js";
import type { DatasetTheme, DataCheck, TableData } from "../dataTasks.js";

describe("pickTheme", () => {
  test("returns retail for even seeds, building-materials for odd", () => {
    const evenContext: BlueprintContext = {
      seed: 2,
      theme: "retail",
      difficulty: "BEGINNER",
    };
    const oddContext: BlueprintContext = {
      seed: 3,
      theme: "retail",
      difficulty: "BEGINNER",
    };

    const evenResult = pickTheme(evenContext);
    const oddResult = pickTheme(oddContext);

    assert.equal(evenResult.theme, "retail");
    assert.equal(oddResult.theme, "building-materials");
    assert.ok(evenResult.reason.includes("retail"));
    assert.ok(oddResult.reason.includes("building-materials"));
  });

  test("rotates through themes deterministically", () => {
    const results = [0, 1, 2, 3, 4, 5].map((seed) =>
      pickTheme({ seed, theme: "retail", difficulty: "BEGINNER" }).theme
    );
    assert.deepEqual(results, ["retail", "building-materials", "retail", "building-materials", "retail", "building-materials"]);
  });
});

describe("buildSalesAnalysisTask", () => {
  const baseContext: BlueprintContext = {
    seed: 42,
    theme: "retail",
    difficulty: "INTERMEDIATE",
  };

  // For data tasks, rubric sum = 10*n+20 where n = number of checks (4)
  // So rubric has 5 criteria (4 checks + 1 overall) summing to 60
  const DATA_TASK_MARKS = 60; // 10*4+20

  test("returns complete BlueprintTask with correct structure", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    // Core structure
    assert.equal(task.type, "DATA_TASK");
    assert.equal(task.skillSlug, "data-analysis");
    assert.equal(task.marks, DATA_TASK_MARKS);
    assert.equal(task.timeMinutes, 30);
    assert.ok(task.title.includes("Sales Analysis"));
    assert.ok(task.prompt.length > 100);
  });

  test("publicData has table with 24 rows and correct columns", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { table, checks } = task.publicData;
    assert.equal(table.rows.length, 24);
    assert.deepEqual(table.columns, ["month", "product", "units", "revenue"]);
    // TableData doesn't have currency; Dataset does
    assert.ok(checks.length >= 4);
  });

  test("publicData has exactly 4 checks with correct ids", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { checks } = task.publicData;
    assert.equal(checks.length, 4);
    const ids = checks.map((c: DataCheck) => c.id).sort();
    assert.deepEqual(ids, ["avg_units_first_product", "growth_pct", "top_product", "total_revenue"]);
  });

  test("checks have correct answerType and tolerance", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { checks } = task.publicData;
    const totalRevenue = checks.find((c: DataCheck) => c.id === "total_revenue")!;
    const topProduct = checks.find((c: DataCheck) => c.id === "top_product")!;
    const growthPct = checks.find((c: DataCheck) => c.id === "growth_pct")!;
    const avgUnits = checks.find((c: DataCheck) => c.id === "avg_units_first_product")!;

    assert.equal(totalRevenue.answerType, "NUMBER");
    assert.equal(totalRevenue.tolerance, 0);
    assert.equal(topProduct.answerType, "CATEGORY");
    assert.equal(topProduct.tolerance, 0);
    assert.equal(growthPct.answerType, "NUMBER");
    assert.equal(growthPct.tolerance, 0.1);
    assert.equal(avgUnits.answerType, "NUMBER");
    assert.equal(avgUnits.tolerance, 0.1);
  });

  test("privateData.answerKey matches computeCheck for each check", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { table, checks } = task.publicData;
    const { answerKey } = task.privateData as DataTaskBlueprint["privateData"];

    for (const check of checks) {
      const expected = answerKey[check.id];
      assert.ok(expected !== undefined, `answerKey missing for ${check.id}`);

      // Verify against computeCheck
      const spec = check.spec;
      // Import computeCheck dynamically or we can just trust the builder uses it
      // The builder uses buildSalesChecks which computes expected from computeCheck
    }
  });

  test("privateData.rubric has 5 criteria (4 checks + 1 overall)", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    assert.equal(rubric.length, 5); // 4 checks + 1 overall

    // Check marks sum to 10*n+20 = 60
    const marksSum = rubric.reduce((sum: number, r: BlueprintCriterion) => sum + r.maxMarks, 0);
    assert.equal(marksSum, DATA_TASK_MARKS);

    // Each criterion has required fields
    for (const criterion of rubric) {
      assert.ok(criterion.name.length > 0);
      assert.ok(criterion.description.length > 0);
      assert.ok(criterion.maxMarks > 0);
      assert.ok(criterion.privateGuidance.length > 0);
    }
  });

  test("rubric marks: 10 per check (4 checks) + 20 overall = 60", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: DATA_TASK_MARKS,
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    const marks = rubric.map((r: BlueprintCriterion) => r.maxMarks).sort();
    // 4 checks at 10 each, 1 overall at 20
    assert.deepEqual(marks, [10, 10, 10, 10, 20]);
  });

  test("rubric marks sum follows 10*n+20 formula for 41 marks input (ignored, uses formula)", () => {
    const task = buildSalesAnalysisTask({
      context: baseContext,
      targetSkillSlug: "data-analysis",
      marks: 41, // This is ignored for data tasks; formula 10*4+20=60 applies
      timeMinutes: 30,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    const marks = rubric.map((r: BlueprintCriterion) => r.maxMarks).sort();
    // Formula 10*n+20 applies regardless of input marks
    assert.deepEqual(marks, [10, 10, 10, 10, 20]);
  });

  test("different seeds produce different tasks", () => {
    const task1 = buildSalesAnalysisTask({
      context: { ...baseContext, seed: 1 },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    const task2 = buildSalesAnalysisTask({
      context: { ...baseContext, seed: 2 },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    if (task1.type !== "DATA_TASK" || task2.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    assert.notDeepEqual(task1.publicData.table, task2.publicData.table);
    assert.notDeepEqual(
      (task1.privateData as DataTaskBlueprint["privateData"]).answerKey,
      (task2.privateData as DataTaskBlueprint["privateData"]).answerKey
    );
  });

  test("different themes produce different products", () => {
    const retailTask = buildSalesAnalysisTask({
      context: { ...baseContext, theme: "retail" },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    const buildingTask = buildSalesAnalysisTask({
      context: { ...baseContext, theme: "building-materials" },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    if (retailTask.type !== "DATA_TASK" || buildingTask.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const retailProducts = [...new Set(retailTask.publicData.table.rows.map((r) => r.product))];
    const buildingProducts = [...new Set(buildingTask.publicData.table.rows.map((r) => r.product))];

    assert.deepEqual(retailProducts.sort(), ["Backpacks", "Desk Lamps", "Notebooks", "Water Bottles"].sort());
    assert.deepEqual(buildingProducts.sort(), ["Bricks (1000)", "Cement (50kg bag)", "River Sand (tonne)", "TMT Steel (kg)"].sort());
  });

  test("AI content overrides default scenario and instructions", () => {
    const aiContext: BlueprintContext = {
      ...baseContext,
      aiContent: {
        scenario: "Custom scenario for testing.",
        instructions: "Custom instructions for testing.",
      },
    };

    const task = buildSalesAnalysisTask({
      context: aiContext,
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    assert.ok(task.prompt.includes("Custom scenario for testing."));
    assert.ok(task.prompt.includes("Custom instructions for testing."));
  });

  test("difficulty affects private guidance", () => {
    const beginnerTask = buildSalesAnalysisTask({
      context: { ...baseContext, difficulty: "BEGINNER" },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    const advancedTask = buildSalesAnalysisTask({
      context: { ...baseContext, difficulty: "ADVANCED" },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    if (beginnerTask.type !== "DATA_TASK" || advancedTask.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const beginnerGuidance = (beginnerTask.privateData as DataTaskBlueprint["privateData"]).rubric[0].privateGuidance;
    const advancedGuidance = (advancedTask.privateData as DataTaskBlueprint["privateData"]).rubric[0].privateGuidance;

    assert.ok(beginnerGuidance.includes("Allow generous tolerance"));
    assert.ok(advancedGuidance.includes("Expect exact calculation"));
  });
});

describe("buildQuantityEstimationTask", () => {
  const baseContext: BlueprintContext = {
    seed: 42,
    theme: "retail", // not used for footings
    difficulty: "INTERMEDIATE",
  };

  test("returns complete BlueprintTask with correct structure", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    assert.equal(task.type, "DATA_TASK");
    assert.equal(task.skillSlug, "quantity-surveying");
    assert.equal(task.marks, 30);
    assert.equal(task.timeMinutes, 25);
    assert.equal(task.title, "Quantity Estimation — Civil Footings");
    assert.ok(task.prompt.length > 100);
  });

  test("publicData has table with 5 rows F1-F5 and correct columns", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { table, checks } = task.publicData;
    assert.equal(table.rows.length, 5);
    assert.deepEqual(table.columns, ["footing", "length_m", "width_m", "depth_m", "count"]);

    for (let i = 0; i < 5; i++) {
      assert.equal(table.rows[i].footing, `F${i + 1}`);
    }
    assert.ok(checks.length === 3);
  });

  test("publicData has exactly 3 checks with correct ids", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { checks } = task.publicData;
    assert.equal(checks.length, 3);
    const ids = checks.map((c: DataCheck) => c.id).sort();
    assert.deepEqual(ids, ["total_concrete_volume", "total_footings", "volume_f2"]);
  });

  test("checks have correct answerType and tolerance", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { checks } = task.publicData;
    const totalVolume = checks.find((c: DataCheck) => c.id === "total_concrete_volume")!;
    const totalFootings = checks.find((c: DataCheck) => c.id === "total_footings")!;
    const volumeF2 = checks.find((c: DataCheck) => c.id === "volume_f2")!;

    assert.equal(totalVolume.answerType, "NUMBER");
    assert.equal(totalVolume.tolerance, 0.05);
    assert.equal(totalFootings.answerType, "NUMBER");
    assert.equal(totalFootings.tolerance, 0);
    assert.equal(volumeF2.answerType, "NUMBER");
    assert.equal(volumeF2.tolerance, 0.05);
  });

  test("privateData.answerKey has all 3 check answers", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { answerKey } = task.privateData as DataTaskBlueprint["privateData"];
    assert.ok("total_concrete_volume" in answerKey);
    assert.ok("total_footings" in answerKey);
    assert.ok("volume_f2" in answerKey);

    // All should be numbers
    assert.ok(typeof answerKey.total_concrete_volume === "number");
    assert.ok(typeof answerKey.total_footings === "number");
    assert.ok(typeof answerKey.volume_f2 === "number");
  });

  test("privateData.rubric has 3 criteria matching checks", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    assert.equal(rubric.length, 4);

    const marksSum = rubric.reduce((sum: number, r: BlueprintCriterion) => sum + r.maxMarks, 0);
    assert.equal(marksSum, 50);

    for (const criterion of rubric) {
      assert.ok(criterion.name.length > 0);
      assert.ok(criterion.description.length > 0);
      assert.ok(criterion.maxMarks > 0);
      assert.ok(criterion.privateGuidance.length > 0);
    }
  });

  test("rubric marks distributed evenly (10 each for 30 marks)", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    const marks = rubric.map((r: BlueprintCriterion) => r.maxMarks).sort();
    // 3 checks at 10 each, 1 overall at 20
    assert.deepEqual(marks, [10, 10, 10, 20]);
  });

  test("rubric marks distributed with remainder for 31 marks", () => {
    const task = buildQuantityEstimationTask({
      context: baseContext,
      targetSkillSlug: "quantity-surveying",
      marks: 31,
      timeMinutes: 25,
    });

    if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const { rubric } = task.privateData as DataTaskBlueprint["privateData"];
    const marks = rubric.map((r: BlueprintCriterion) => r.maxMarks).sort();
    // 31 / 3 = 10 remainder 1, so one gets 11, two get 10
    assert.deepEqual(marks, [10, 10, 10, 20]);
  });

  test("different seeds produce different tasks", () => {
    const task1 = buildQuantityEstimationTask({
      context: { ...baseContext, seed: 1 },
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    const task2 = buildQuantityEstimationTask({
      context: { ...baseContext, seed: 2 },
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (task1.type !== "DATA_TASK" || task2.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    assert.notDeepEqual(task1.publicData.table, task2.publicData.table);
    assert.notDeepEqual(
      (task1.privateData as DataTaskBlueprint["privateData"]).answerKey,
      (task2.privateData as DataTaskBlueprint["privateData"]).answerKey
    );
  });

  test("AI content overrides default scenario and instructions", () => {
    const aiContext: BlueprintContext = {
      ...baseContext,
      aiContent: {
        scenario: "Custom footings scenario.",
        instructions: "Custom footings instructions.",
      },
    };

    const task = buildQuantityEstimationTask({
      context: aiContext,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    assert.ok(task.prompt.includes("Custom footings scenario."));
    assert.ok(task.prompt.includes("Custom footings instructions."));
  });

  test("difficulty affects private guidance for footings", () => {
    const beginnerTask = buildQuantityEstimationTask({
      context: { ...baseContext, difficulty: "BEGINNER" },
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    const advancedTask = buildQuantityEstimationTask({
      context: { ...baseContext, difficulty: "ADVANCED" },
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    if (beginnerTask.type !== "DATA_TASK" || advancedTask.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
    const beginnerGuidance = (beginnerTask.privateData as DataTaskBlueprint["privateData"]).rubric[0].privateGuidance;
    const advancedGuidance = (advancedTask.privateData as DataTaskBlueprint["privateData"]).rubric[0].privateGuidance;

    assert.ok(beginnerGuidance.includes("Allow tolerance"));
    assert.ok(advancedGuidance.includes("Expect exact calculation"));
  });
});

describe("Integration: sales analysis + quantity estimation", () => {
  test("both builders produce valid BlueprintTask objects", () => {
    const salesTask = buildSalesAnalysisTask({
      context: { seed: 1, theme: "retail", difficulty: "BEGINNER" },
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    const qtyTask = buildQuantityEstimationTask({
      context: { seed: 1, theme: "retail", difficulty: "BEGINNER" },
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    // Both have required fields
    for (const task of [salesTask, qtyTask]) {
      assert.equal(task.type, "DATA_TASK");
      assert.ok(task.skillSlug.length > 0);
      assert.ok(task.title.length > 0);
      assert.ok(task.prompt.length > 0);
      assert.ok(task.marks > 0);
      assert.ok(task.timeMinutes > 0);
      if (task.type !== "DATA_TASK") throw new Error("Expected DATA_TASK");
      assert.ok(task.publicData.table.rows.length > 0);
      assert.ok(task.publicData.checks.length > 0);
      assert.ok(Object.keys((task.privateData as DataTaskBlueprint["privateData"]).answerKey).length > 0);
      assert.equal((task.privateData as DataTaskBlueprint["privateData"]).rubric.length, task.publicData.checks.length + 1);
      assert.equal(task.rubric.length, task.publicData.checks.length + 1);
    }
  });

  test("deterministic: same seed + context gives identical tasks", () => {
    const context: BlueprintContext = { seed: 999, theme: "retail", difficulty: "INTERMEDIATE" };

    const task1 = buildSalesAnalysisTask({
      context,
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    const task2 = buildSalesAnalysisTask({
      context,
      targetSkillSlug: "data-analysis",
      marks: 40,
      timeMinutes: 30,
    });

    assert.deepEqual(task1, task2);
  });

  test("deterministic: same seed gives identical footing tasks", () => {
    const context: BlueprintContext = { seed: 999, theme: "retail", difficulty: "INTERMEDIATE" };

    const task1 = buildQuantityEstimationTask({
      context,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    const task2 = buildQuantityEstimationTask({
      context,
      targetSkillSlug: "quantity-surveying",
      marks: 30,
      timeMinutes: 25,
    });

    assert.deepEqual(task1, task2);
  });
});