/**
 * Tests for responseBlueprints.ts, fileBlueprints.ts, and index.ts (registry).
 * Uses node:test and node:assert/strict only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildClientCommunicationTask,
  buildNegotiationTask,
  buildDrawingInterpretationTask,
} from "./responseBlueprints.js";

import {
  buildAutoCadTask,
  buildGenericFileTask,
} from "./fileBlueprints.js";

import {
  buildSalesAnalysisTask,
  buildQuantityEstimationTask,
} from "./dataBlueprints.js";

import {
  hasSpecificBlueprint,
  buildGenericTask,
  buildTaskForSkill,
} from "./index.js";

import type { BlueprintContext, BlueprintTask, BlueprintCriterion, StructuredResponseBlueprint, FileSubmissionBlueprint, DataTaskBlueprint } from "./types.js";
import type { DataCheck } from "../dataTasks.js";

// ============================================================================
// Test utilities
// ============================================================================

function makeContext(overrides: Partial<BlueprintContext> = {}): BlueprintContext {
  return {
    seed: 1,
    theme: "retail",
    difficulty: "BEGINNER",
    skillSlug: "test-skill",
    skillName: "Test Skill",
    jobTitle: "Test Role",
    companyName: "Test Company",
    skill: {
      assessmentTypes: ["STRUCTURED_RESPONSE"],
    },
    ...overrides,
  };
}

function sumWeights(rubric: BlueprintCriterion[]): number {
  return rubric.reduce((sum, c) => sum + c.maxMarks, 0);
}

function validateCriterion(c: BlueprintCriterion, label: string) {
  assert.ok(c.name.length >= 2 && c.name.length <= 100, `${label}: name length 2..100`);
  assert.ok(c.description.length >= 5 && c.description.length <= 500, `${label}: description length 5..500`);
  assert.ok(c.privateGuidance.length >= 5 && c.privateGuidance.length <= 1500, `${label}: privateGuidance length 5..1500`);
  assert.ok(Number.isInteger(c.maxMarks) && c.maxMarks >= 1, `${label}: integer weight >= 1`);
}

function validateTaskStructure(task: BlueprintTask, label: string) {
  assert.equal(typeof task.isGeneric, "boolean", `${label}: isGeneric is boolean`);
  assert.ok(task.title.length >= 3 && task.title.length <= 120, `${label}: title length 3..120`);
  assert.ok(task.prompt.length >= 20 && task.prompt.length <= 4000, `${label}: prompt length 20..4000`);
  assert.ok(!task.prompt.includes("undefined"), `${label}: prompt contains no "undefined"`);
  assert.ok(!task.prompt.includes("[object"), `${label}: prompt contains no "[object"`);
  for (const c of task.rubric) {
    validateCriterion(c, `${label}: rubric`);
  }
}

// Recursively scan for forbidden keys in publicData
// Note: "checks", "spec", "tolerance" are valid publicData for DATA_TASK (candidates see the evaluation criteria)
const FORBIDDEN_KEYS = [
  "privateData",
  "privateGuidance",
  "expected",
  "plantedDiscrepancies",
  "reviewChecklist",
  "redFlags",
  "keyFacts",
  "strongAnswerSignals",
  "decliningProduct",
  "evaluation",
];

function findForbiddenKeys(obj: unknown, path: string = ""): string[] {
  const found: string[] = [];
  if (obj === null || typeof obj !== "object") return found;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      found.push(...findForbiddenKeys(item, `${path}[${i}]`));
    });
    return found;
  }
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.includes(key)) {
      found.push(fullPath);
    }
    found.push(...findForbiddenKeys(value, fullPath));
  }
  return found;
}

// ============================================================================
// 7 specific slugs × 3 difficulties × seeds 1,2,3
// ============================================================================

const SPECIFIC_SLUGS = [
  "excel",
  "data-analysis",
  "quantity-estimation",
  "client-communication",
  "negotiation",
  "technical-drawing-interpretation",
  "autocad",
];

const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const SEEDS = [1, 2, 3];

describe("All specific blueprints — structure & validity", () => {
  for (const slug of SPECIFIC_SLUGS) {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        test(`${slug} / ${difficulty} / seed=${seed}`, () => {
          const ctx = makeContext({
            seed,
            difficulty,
            skillSlug: slug,
            skillName: "Test Skill",
            skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] },
          });

          let task: BlueprintTask;
          switch (slug) {
            case "excel":
            case "data-analysis":
              task = buildSalesAnalysisTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 30 });
              break;
            case "quantity-estimation":
              task = buildQuantityEstimationTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 25 });
              break;
            case "client-communication":
              task = buildClientCommunicationTask(ctx);
              break;
            case "negotiation":
              task = buildNegotiationTask(ctx);
              break;
            case "technical-drawing-interpretation":
              task = buildDrawingInterpretationTask(ctx);
              break;
            case "autocad":
              task = buildAutoCadTask(ctx);
              break;
            default:
              throw new Error(`Unknown slug ${slug}`);
          }

          assert.equal(task.isGeneric, false, `${slug}: isGeneric is false`);
          validateTaskStructure(task, slug);
        });
      }
    }
  }
});

// ============================================================================
// Rubric weights sum to exactly 100 (non-data) or 10*n+20 (data)
// ============================================================================

describe("Rubric weights sum correctly", () => {
  const nonDataSlugs = ["client-communication", "negotiation", "technical-drawing-interpretation", "autocad"];
  const dataSlugs = ["excel", "data-analysis", "quantity-estimation"];

  for (const slug of nonDataSlugs) {
    test(`${slug}: rubric weights sum to 100`, () => {
      const ctx = makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: slug });
      let task: BlueprintTask;
      switch (slug) {
        case "client-communication":
          task = buildClientCommunicationTask(ctx);
          break;
        case "negotiation":
          task = buildNegotiationTask(ctx);
          break;
        case "technical-drawing-interpretation":
          task = buildDrawingInterpretationTask(ctx);
          break;
        case "autocad":
          task = buildAutoCadTask(ctx);
          break;
        default:
          throw new Error(`Unknown slug ${slug}`);
      }
      const sum = sumWeights(task.rubric);
      assert.equal(sum, 100, `${slug}: rubric weights sum to ${sum}, expected 100`);
    });
  }

  for (const slug of dataSlugs) {
    test(`${slug}: rubric weights sum to 10*n+20`, () => {
      const ctx = makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: slug });
      let task: BlueprintTask;
      if (slug === "quantity-estimation") {
        task = buildQuantityEstimationTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 25 });
      } else {
        task = buildSalesAnalysisTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 30 });
      }
      const sum = sumWeights(task.rubric);
      // Type narrowing for data tasks
      if (task.type === "DATA_TASK") {
        const n = task.publicData.checks.length;
        const expected = 10 * n + 20;
        assert.equal(sum, expected, `${slug}: rubric weights sum to ${sum}, expected ${expected} (10*${n}+20)`);
      }
    });
  }
});

// ============================================================================
// Deterministic: same ctx gives deep-equal output
// ============================================================================

describe("Deterministic output", () => {
  for (const slug of SPECIFIC_SLUGS) {
    test(`${slug}: same context produces identical tasks`, () => {
      const ctx = makeContext({ seed: 42, difficulty: "ADVANCED", skillSlug: slug });
      let task1: BlueprintTask;
      let task2: BlueprintTask;
      switch (slug) {
        case "excel":
        case "data-analysis":
          task1 = buildSalesAnalysisTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 30 });
          task2 = buildSalesAnalysisTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 30 });
          break;
        case "quantity-estimation":
          task1 = buildQuantityEstimationTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 25 });
          task2 = buildQuantityEstimationTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 25 });
          break;
        case "client-communication":
          task1 = buildClientCommunicationTask(ctx);
          task2 = buildClientCommunicationTask(ctx);
          break;
        case "negotiation":
          task1 = buildNegotiationTask(ctx);
          task2 = buildNegotiationTask(ctx);
          break;
        case "technical-drawing-interpretation":
          task1 = buildDrawingInterpretationTask(ctx);
          task2 = buildDrawingInterpretationTask(ctx);
          break;
        case "autocad":
          task1 = buildAutoCadTask(ctx);
          task2 = buildAutoCadTask(ctx);
          break;
        default:
          throw new Error(`Unknown slug ${slug}`);
      }
      assert.deepEqual(task1, task2, `${slug}: tasks are not deep-equal`);
    });
  }

  // Generic tasks also deterministic
  test("generic STRUCTURED_RESPONSE: deterministic", () => {
    const ctx = makeContext({ seed: 99, skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] } });
    const t1 = buildGenericTask(ctx);
    const t2 = buildGenericTask(ctx);
    assert.deepEqual(t1, t2);
  });

  test("generic DATA_TASK: deterministic", () => {
    const ctx = makeContext({ seed: 99, skill: { assessmentTypes: ["DATA_TASK"] } });
    const t1 = buildGenericTask(ctx);
    const t2 = buildGenericTask(ctx);
    assert.deepEqual(t1, t2);
  });

  test("generic FILE_SUBMISSION: deterministic", () => {
    const ctx = makeContext({ seed: 99, skill: { assessmentTypes: ["FILE_SUBMISSION"] } });
    const t1 = buildGenericTask(ctx);
    const t2 = buildGenericTask(ctx);
    assert.deepEqual(t1, t2);
  });

  test("generic file tasks: deterministic", () => {
    const ctx = makeContext({ seed: 55 });
    const t1 = buildGenericFileTask(ctx);
    const t2 = buildGenericFileTask(ctx);
    assert.deepEqual(t1, t2);
  });

  test("autocad task: deterministic", () => {
    const ctx = makeContext({ seed: 77, skillSlug: "autocad" });
    const t1 = buildAutoCadTask(ctx);
    const t2 = buildAutoCadTask(ctx);
    assert.deepEqual(t1, t2);
  });
});

// ============================================================================
// client-communication: seeds 1..10 produce at least 2 different prompts
// ============================================================================

describe("Variation in client-communication prompts", () => {
  test("seeds 1..10 produce at least 2 different prompts", () => {
    const prompts = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const ctx = makeContext({ seed, skillSlug: "client-communication" });
      const task = buildClientCommunicationTask(ctx);
      prompts.add(task.prompt);
    }
    assert.ok(prompts.size >= 2, `Only ${prompts.size} unique prompts from 10 seeds`);
  });
});

// ============================================================================
// Leak test: no forbidden keys in publicData
// ============================================================================

describe("Leak test: no private keys in publicData", () => {
  for (const slug of SPECIFIC_SLUGS) {
    test(`${slug}: publicData has no forbidden keys`, () => {
      const ctx = makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: slug });
      let task: BlueprintTask;
      switch (slug) {
        case "excel":
        case "data-analysis":
          task = buildSalesAnalysisTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 30 });
          break;
        case "quantity-estimation":
          task = buildQuantityEstimationTask({ context: ctx, targetSkillSlug: slug, marks: 100, timeMinutes: 25 });
          break;
        case "client-communication":
          task = buildClientCommunicationTask(ctx);
          break;
        case "negotiation":
          task = buildNegotiationTask(ctx);
          break;
        case "technical-drawing-interpretation":
          task = buildDrawingInterpretationTask(ctx);
          break;
        case "autocad":
          task = buildAutoCadTask(ctx);
          break;
        default:
          throw new Error(`Unknown slug ${slug}`);
      }
      const leaks = findForbiddenKeys(task.publicData, "publicData");
      assert.equal(leaks.length, 0, `${slug}: forbidden keys found in publicData: ${leaks.join(", ")}`);
    });
  }

  // Generic tasks too
  test("generic STRUCTURED_RESPONSE: no leaks", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] } });
    const task = buildGenericTask(ctx);
    const leaks = findForbiddenKeys(task.publicData, "publicData");
    assert.equal(leaks.length, 0, `leaks: ${leaks.join(", ")}`);
  });

  test("generic DATA_TASK: no leaks", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["DATA_TASK"] } });
    const task = buildGenericTask(ctx);
    const leaks = findForbiddenKeys(task.publicData, "publicData");
    assert.equal(leaks.length, 0, `leaks: ${leaks.join(", ")}`);
  });

  test("generic FILE_SUBMISSION: no leaks", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["FILE_SUBMISSION"] } });
    const task = buildGenericTask(ctx);
    const leaks = findForbiddenKeys(task.publicData, "publicData");
    assert.equal(leaks.length, 0, `leaks: ${leaks.join(", ")}`);
  });

  test("buildAutoCadTask: no leaks", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "autocad" });
    const task = buildAutoCadTask(ctx);
    const leaks = findForbiddenKeys(task.publicData, "publicData");
    assert.equal(leaks.length, 0, `leaks: ${leaks.join(", ")}`);
  });

  test("buildGenericFileTask: no leaks", () => {
    const ctx = makeContext({ seed: 1 });
    const task = buildGenericFileTask(ctx);
    const leaks = findForbiddenKeys(task.publicData, "publicData");
    assert.equal(leaks.length, 0, `leaks: ${leaks.join(", ")}`);
  });
});

// ============================================================================
// File tasks: publicData.evaluationNote exists and contains "reviewer"
// ============================================================================

describe("File tasks have evaluationNote with 'reviewer'", () => {
  test("buildAutoCadTask has evaluationNote containing 'reviewer'", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "autocad" });
    const task = buildAutoCadTask(ctx);
    assert.ok("evaluationNote" in task.publicData, "evaluationNote missing");
    const note = String(task.publicData.evaluationNote).toLowerCase();
    assert.ok(note.includes("reviewer"), `evaluationNote does not contain "reviewer": ${note}`);
  });

  test("buildGenericFileTask has evaluationNote containing 'reviewer'", () => {
    const ctx = makeContext({ seed: 1 });
    const task = buildGenericFileTask(ctx);
    assert.ok("evaluationNote" in task.publicData, "evaluationNote missing");
    const note = String(task.publicData.evaluationNote).toLowerCase();
    assert.ok(note.includes("reviewer"), `evaluationNote does not contain "reviewer": ${note}`);
  });
});

// ============================================================================
// Registry: hasSpecificBlueprint, buildGenericTask, buildTaskForSkill
// ============================================================================

describe("Registry functions", () => {
  test("hasSpecificBlueprint true for 7 slugs", () => {
    for (const slug of SPECIFIC_SLUGS) {
      assert.equal(hasSpecificBlueprint(slug), true, `${slug} should have specific blueprint`);
    }
  });

  test("hasSpecificBlueprint false for 'persuasion'", () => {
    assert.equal(hasSpecificBlueprint("persuasion"), false, "persuasion should not have specific blueprint");
  });

  test("buildGenericTask with STRUCTURED_RESPONSE returns isGeneric true and correct type", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] } });
    const task = buildGenericTask(ctx);
    assert.equal(task.isGeneric, true);
    assert.equal(task.type, "STRUCTURED_RESPONSE");
  });

  test("buildGenericTask with DATA_TASK returns isGeneric true and correct type", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["DATA_TASK"] } });
    const task = buildGenericTask(ctx);
    assert.equal(task.isGeneric, true);
    assert.equal(task.type, "DATA_TASK");
  });

  test("buildGenericTask with FILE_SUBMISSION returns isGeneric true and correct type", () => {
    const ctx = makeContext({ skill: { assessmentTypes: ["FILE_SUBMISSION"] } });
    const task = buildGenericTask(ctx);
    assert.equal(task.isGeneric, true);
    assert.equal(task.type, "FILE_SUBMISSION");
  });

  test("buildTaskForSkill uses specific builder for registered slugs", () => {
    for (const slug of SPECIFIC_SLUGS) {
      const ctx = makeContext({ seed: 1, skillSlug: slug, skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] } });
      const task = buildTaskForSkill(ctx);
      assert.equal(task.isGeneric, false, `${slug}: should use specific builder (isGeneric=false)`);
    }
  });

  test("buildTaskForSkill uses generic builder for unregistered slug", () => {
    const ctx = makeContext({ skillSlug: "persuasion", skill: { assessmentTypes: ["STRUCTURED_RESPONSE"] } });
    const task = buildTaskForSkill(ctx);
    assert.equal(task.isGeneric, true, "persuasion: should use generic builder (isGeneric=true)");
  });
});

// ============================================================================
// Drawing task: plantedDiscrepancies has exactly 3 entries, values differ
// ============================================================================

describe("Drawing interpretation: planted discrepancies", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      test(`seed=${seed} difficulty=${difficulty}: 3 discrepancies, values differ`, () => {
        const ctx = makeContext({ seed, difficulty, skillSlug: "technical-drawing-interpretation" });
        const task = buildDrawingInterpretationTask(ctx);

        // Type narrowing for STRUCTURED_RESPONSE
        if (task.type === "STRUCTURED_RESPONSE") {
          const discrepancies = task.privateData.plantedDiscrepancies;
          assert.ok(Array.isArray(discrepancies), "plantedDiscrepancies is array");
          assert.equal(discrepancies.length, 3, "exactly 3 discrepancies");

          for (const d of discrepancies) {
            assert.ok(d.topic && typeof d.topic === "string", "has topic");
            assert.ok(Array.isArray(d.sheets) && d.sheets.length === 2, "has 2 sheets");
            assert.ok(Array.isArray(d.values) && d.values.length === 2, "has 2 values");
            // Values must differ
            assert.notEqual(d.values[0], d.values[1], `values differ for ${d.topic}: ${d.values}`);
          }
        }
      });
    }
  }
});

// ============================================================================
// Additional validation: responseBlueprints specific fields
// ============================================================================

describe("Response blueprints: required fields present", () => {
  test("buildClientCommunicationTask: publicData has scenario, clientMessage, wordLimit, deliverable", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "client-communication" });
    const task = buildClientCommunicationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(task.publicData.scenario && typeof task.publicData.scenario === "object");
      assert.ok(task.publicData.scenario.orderRef);
      assert.ok(task.publicData.scenario.clientName);
      assert.ok(task.publicData.scenario.clientOrg);
      assert.ok(task.publicData.scenario.orderValueInr);
      assert.ok(Array.isArray(task.publicData.scenario.facts));
      assert.ok(task.publicData.clientMessage && typeof task.publicData.clientMessage === "string");
      assert.equal(task.publicData.wordLimit, 250);
      assert.equal(task.publicData.deliverable, "A reply email");
    }
  });

  test("buildClientCommunicationTask: privateData has keyFacts, redFlags", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "client-communication" });
    const task = buildClientCommunicationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(Array.isArray(task.privateData.keyFacts));
      assert.ok(Array.isArray(task.privateData.redFlags));
    }
  });

  test("buildNegotiationTask: publicData has scenario, sections, wordLimit", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "negotiation" });
    const task = buildNegotiationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(task.publicData.scenario && typeof task.publicData.scenario === "object");
      assert.ok(task.publicData.scenario.supplier);
      assert.ok(task.publicData.scenario.increasePct);
      assert.ok(task.publicData.scenario.monthlySpendInr);
      assert.ok(task.publicData.scenario.relationshipYears);
      assert.ok(task.publicData.scenario.absorbPct);
      assert.ok(Array.isArray(task.publicData.scenario.facts));
      assert.ok(Array.isArray(task.publicData.sections) && task.publicData.sections.length === 3);
      assert.equal(task.publicData.wordLimit, 150);
    }
  });

  test("buildNegotiationTask: privateData has strongAnswerSignals, redFlags", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "negotiation" });
    const task = buildNegotiationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(Array.isArray(task.privateData.strongAnswerSignals));
      assert.ok(Array.isArray(task.privateData.redFlags));
    }
  });

  test("buildDrawingInterpretationTask: publicData has extracts, instructions", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "technical-drawing-interpretation" });
    const task = buildDrawingInterpretationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(Array.isArray(task.publicData.extracts) && task.publicData.extracts.length === 3);
      for (const e of task.publicData.extracts) {
        assert.ok(e.sheet && e.title && Array.isArray(e.notes));
      }
      assert.ok(task.publicData.instructions && typeof task.publicData.instructions === "string");
    }
  });

  test("buildDrawingInterpretationTask: privateData has plantedDiscrepancies, consistentItems", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "technical-drawing-interpretation" });
    const task = buildDrawingInterpretationTask(ctx);
    if (task.type === "STRUCTURED_RESPONSE") {
      assert.ok(Array.isArray(task.privateData.plantedDiscrepancies));
      assert.ok(Array.isArray(task.privateData.consistentItems));
    }
  });
});

// ============================================================================
// File blueprints: required fields
// ============================================================================

describe("File blueprints: required fields present", () => {
  test("buildAutoCadTask: publicData has brief, requirements, deliverables, maxFileMB, evaluationNote", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "autocad" });
    const task = buildAutoCadTask(ctx);
    if (task.type === "FILE_SUBMISSION") {
      assert.ok(task.publicData.brief);
      assert.ok(Array.isArray(task.publicData.requirements));
      assert.ok(Array.isArray(task.publicData.deliverables) && task.publicData.deliverables.length === 2);
      assert.equal(task.publicData.maxFileMB, 10);
      assert.ok(task.publicData.evaluationNote);
      // deliverables have correct accept types
      const dwg = task.publicData.deliverables.find((d) => d.label === "Drawing file");
      const pdf = task.publicData.deliverables.find((d) => d.label === "PDF plot");
      assert.ok(dwg && dwg.accept.includes(".dwg"));
      assert.ok(pdf && pdf.accept.includes(".pdf"));
    }
  });

  test("buildAutoCadTask: privateData has reviewChecklist, expected", () => {
    const ctx = makeContext({ seed: 1, skillSlug: "autocad" });
    const task = buildAutoCadTask(ctx);
    if (task.type === "FILE_SUBMISSION") {
      assert.ok(Array.isArray(task.privateData.reviewChecklist));
      assert.ok(task.privateData.expected && typeof task.privateData.expected === "object");
      assert.ok(task.privateData.expected.internalLength);
      assert.ok(task.privateData.expected.internalWidth);
      assert.equal(task.privateData.expected.wallThickness, 0.23);
    }
  });

  test("buildGenericFileTask: publicData has brief, requirements, deliverables, maxFileMB, evaluationNote", () => {
    const ctx = makeContext({ seed: 1 });
    const task = buildGenericFileTask(ctx);
    if (task.type === "FILE_SUBMISSION") {
      assert.ok(task.publicData.brief);
      assert.ok(Array.isArray(task.publicData.requirements));
      assert.ok(Array.isArray(task.publicData.deliverables) && task.publicData.deliverables.length === 1);
      assert.equal(task.publicData.maxFileMB, 10);
      assert.ok(task.publicData.evaluationNote);
      const ws = task.publicData.deliverables[0];
      assert.equal(ws.label, "Work sample");
      assert.ok(ws.accept.includes(".pdf"));
      assert.ok(ws.accept.includes(".docx"));
      assert.ok(ws.accept.includes(".xlsx"));
      assert.ok(ws.accept.includes(".png"));
      assert.ok(ws.accept.includes(".jpg"));
      assert.ok(ws.accept.includes(".zip"));
    }
  });

  test("buildGenericFileTask: privateData has generic: true", () => {
    const ctx = makeContext({ seed: 1 });
    const task = buildGenericFileTask(ctx);
    if (task.type === "FILE_SUBMISSION") {
      assert.equal(task.privateData.generic, true);
    }
  });
});

// ============================================================================
// Difficulty variations are present in prompts
// ============================================================================

describe("Difficulty variations in prompts", () => {
  test("client-communication: INTERMEDIATE adds supplier update line", () => {
    const beginner = buildClientCommunicationTask(makeContext({ seed: 1, difficulty: "BEGINNER", skillSlug: "client-communication" }));
    const intermediate = buildClientCommunicationTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "client-communication" }));
    const advanced = buildClientCommunicationTask(makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: "client-communication" }));

    assert.ok(!beginner.prompt.includes("supplier has promised an update"));
    assert.ok(intermediate.prompt.includes("supplier has promised an update by Thursday noon"));
    assert.ok(advanced.prompt.includes("supplier has promised an update by Thursday noon"));
  });

  test("client-communication: ADVANCED adds no-discount line", () => {
    const intermediate = buildClientCommunicationTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "client-communication" }));
    const advanced = buildClientCommunicationTask(makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: "client-communication" }));

    assert.ok(!intermediate.prompt.includes("not to offer discounts"));
    assert.ok(advanced.prompt.includes("not to offer discounts or free shipping"));
  });

  test("negotiation: INTERMEDIATE adds competing quote", () => {
    const beginner = buildNegotiationTask(makeContext({ seed: 1, difficulty: "BEGINNER", skillSlug: "negotiation" }));
    const intermediate = buildNegotiationTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "negotiation" }));

    assert.ok(!beginner.prompt.includes("competing quote"));
    assert.ok(intermediate.prompt.includes("competing quote about 8%"));
  });

  test("negotiation: ADVANCED adds certified material line", () => {
    const intermediate = buildNegotiationTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "negotiation" }));
    const advanced = buildNegotiationTask(makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: "negotiation" }));

    assert.ok(!intermediate.prompt.includes("certified material"));
    assert.ok(advanced.prompt.includes("only source of a certified material"));
  });

  test("drawing-interpretation: ADVANCED adds rank by cost risk", () => {
    const intermediate = buildDrawingInterpretationTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "technical-drawing-interpretation" }));
    const advanced = buildDrawingInterpretationTask(makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: "technical-drawing-interpretation" }));

    assert.ok(!intermediate.prompt.includes("rank the discrepancies by cost risk"));
    assert.ok(advanced.prompt.includes("rank the discrepancies by cost risk"));
  });

  test("autocad: BEGINNER does not require door/window dimensions", () => {
    const beginner = buildAutoCadTask(makeContext({ seed: 1, difficulty: "BEGINNER", skillSlug: "autocad" }));
    const intermediate = buildAutoCadTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "autocad" }));

    if (beginner.type === "FILE_SUBMISSION" && intermediate.type === "FILE_SUBMISSION") {
      const beginnerReq = beginner.publicData.requirements.find((r: string) => r.includes("Door and window dimensions"));
      const intermediateReq = intermediate.publicData.requirements.find((r: string) => r.includes("Door and window dimensions"));

      assert.ok(beginnerReq?.includes("not required for BEGINNER"));
      assert.ok(intermediateReq?.includes("required for INTERMEDIATE"));
    }
  });

  test("autocad: ADVANCED adds door swing arc and north arrow", () => {
    const intermediate = buildAutoCadTask(makeContext({ seed: 1, difficulty: "INTERMEDIATE", skillSlug: "autocad" }));
    const advanced = buildAutoCadTask(makeContext({ seed: 1, difficulty: "ADVANCED", skillSlug: "autocad" }));

    if (intermediate.type === "FILE_SUBMISSION" && advanced.type === "FILE_SUBMISSION") {
      assert.ok(!intermediate.publicData.requirements.some((r: string) => r.includes("Door swing arc")));
      assert.ok(!intermediate.publicData.requirements.some((r: string) => r.includes("North arrow")));
      assert.ok(advanced.publicData.requirements.some((r: string) => r.includes("Door swing arc")));
      assert.ok(advanced.publicData.requirements.some((r: string) => r.includes("North arrow")));
    }
  });
});