import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleAssessment } from "./assembler.js";
import { generatedAssessmentSchema } from "./schema.js";

type SkillRow = {
  id: string;
  slug: string;
  name: string;
  assessmentTypes: string;
  subskills: { slug: string }[];
};

const library: SkillRow[] = [
  { id: "sk-excel", slug: "excel", name: "Excel", assessmentTypes: "DATA_ANALYTICAL", subskills: [{ slug: "data-analysis" }] },
  {
    id: "sk-client",
    slug: "client-communication",
    name: "Client Communication",
    assessmentTypes: "STRUCTURED_RESPONSE",
    subskills: [{ slug: "email-writing" }],
  },
  {
    id: "sk-neg",
    slug: "negotiation",
    name: "Negotiation",
    assessmentTypes: "STRUCTURED_RESPONSE",
    subskills: [{ slug: "deal-closing" }],
  },
  {
    id: "sk-unknown",
    slug: "unknown-skill",
    name: "Unknown Skill",
    assessmentTypes: "STRUCTURED_RESPONSE",
    subskills: [],
  },
];

function mockPrisma(rows: SkillRow[] = library) {
  return {
    skill: {
      findMany: async ({ where }: { where: { slug: { in: string[] } } }) => {
        const wanted = new Set(where.slug.in);
        return rows.filter((s) => wanted.has(s.slug));
      },
    },
  };
}

const baseConfig = {
  companyName: "Acme Corp",
  aiPolicy: "NOT_ALLOWED" as const,
};

describe("Assessment Assembler", () => {
  it("should generate a three-skill Junior Operations Associate assessment", async () => {
    const result = await assembleAssessment(
      {
        ...baseConfig,
        requirementsText:
          "Looking for a Junior Operations Associate with Excel, client communication and negotiation skills.",
        targetSkills: [
          { skillSlug: "excel", weight: 40, subskills: ["data-analysis"], source: "REQUESTED" },
          { skillSlug: "client-communication", weight: 30, subskills: ["email-writing"], source: "REQUESTED" },
          { skillSlug: "negotiation", weight: 30, subskills: ["deal-closing"], source: "REQUESTED" },
        ],
      },
      mockPrisma(),
    );
    const skillWeights = result.targetSkills.map((s) => s.weight);
    assert.equal(skillWeights.reduce((s, w) => s + w, 0), 100);
    assert.ok(result.tasks.length >= 3);
    assert.equal(result.tasks.reduce((s, t) => s + t.marks, 0), 100);
    assert.equal(result.tasks.reduce((s, t) => s + t.timeMinutes, 0), 45);
    for (const task of result.tasks) {
      assert.equal(task.rubric.reduce((s, c) => s + c.maxMarks, 0), task.marks);
    }
    const excelTask = result.tasks.find((t) => t.skillSlug === "excel");
    assert.equal(excelTask?.type, "DATA_ANALYTICAL");
  });

  it("uses specific blueprint for registered skill", async () => {
    const result = await assembleAssessment(
      {
        ...baseConfig,
        requirementsText: "Test Excel skill for this role.",
        targetSkills: [{ skillSlug: "excel", weight: 100, subskills: [], source: "REQUESTED" }],
      },
      mockPrisma(),
    );
    assert.equal(result.tasks.length, 1);
    assert.ok(result.tasks[0].title.includes("Sales Analysis"));
  });

  it("uses generic fallback for unknown skill", async () => {
    const result = await assembleAssessment(
      {
        ...baseConfig,
        requirementsText: "Test unknown skill for this role.",
        targetSkills: [{ skillSlug: "unknown-skill", weight: 100, subskills: [], source: "REQUESTED" }],
      },
      mockPrisma(),
    );
    assert.ok(result.tasks.length >= 1);
    assert.ok(result.tasks[0].title.includes("workplace scenario"));
  });

  it("rejects invalid skill weights", async () => {
    await assert.rejects(
      () =>
        assembleAssessment(
          {
            ...baseConfig,
            requirementsText: "Test weights for this role.",
            targetSkills: [
              { skillSlug: "excel", weight: 50, subskills: [], source: "REQUESTED" },
              { skillSlug: "client-communication", weight: 40, subskills: [], source: "REQUESTED" },
            ],
          },
          mockPrisma(),
        ),
      /Skill weights must add up to exactly 100/,
    );
  });

  it("rejects invalid task count", async () => {
    await assert.rejects(
      () =>
        assembleAssessment(
          {
            ...baseConfig,
            requirementsText: "Test task count for this role.",
            targetSkills: [{ skillSlug: "excel", weight: 100, subskills: [], source: "REQUESTED" }],
            taskCount: 0,
          },
          mockPrisma(),
        ),
      /Task count cannot be lower than the number of selected skills/,
    );
  });

  it("builds each task from its own seed and stays reproducible", async () => {
    const config = {
      ...baseConfig,
      requirementsText: "Test Excel skill with two tasks for this role.",
      targetSkills: [{ skillSlug: "excel", weight: 100, subskills: [], source: "REQUESTED" as const }],
      taskCount: 2,
      seed: 987654,
    };

    const first = await assembleAssessment(config, mockPrisma());
    const second = await assembleAssessment(config, mockPrisma());

    assert.equal(first.tasks.length, 2);
    // Seeded builders must actually run per task, not be cloned from one blueprint:
    // the datasets differ while the coded instruction text is shared.
    assert.notDeepEqual(first.tasks[0].publicData, first.tasks[1].publicData);
    assert.notDeepEqual(first.tasks[0].privateData, first.tasks[1].privateData);
    assert.ok(!first.tasks[0].prompt.includes("null"));
    assert.ok(!first.tasks[1].prompt.includes("undefined"));
    assert.deepEqual(first.tasks[0].title, "Sales Analysis — Retail — task 1");
    assert.deepEqual(first.tasks[1].title, "Sales Analysis — Retail — task 2");
    // Same configuration and seed still produce the identical assessment.
    assert.deepEqual(first, second);
  });

  it("preserves private data and answer keys", async () => {
    const result = await assembleAssessment(
      {
        ...baseConfig,
        requirementsText: "Test data task for this role.",
        targetSkills: [{ skillSlug: "excel", weight: 100, subskills: [], source: "REQUESTED" }],
      },
      mockPrisma(),
    );
    const task = result.tasks[0];
    assert.ok(task.privateData?.["answerKey"]);
    assert.ok(task.privateData?.["rubric"]);
    assert.equal(task.publicData?.["answerKey"], undefined);
    assert.equal(task.publicData?.["rubric"], undefined);
  });

  it("passes the generatedAssessmentSchema validation", async () => {
    const result = await assembleAssessment(
      {
        ...baseConfig,
        requirementsText: "Test validation for this role.",
        targetSkills: [{ skillSlug: "excel", weight: 100, subskills: [], source: "REQUESTED" }],
      },
      mockPrisma(),
    );
    assert.doesNotThrow(() => generatedAssessmentSchema.parse(result));
  });
});
