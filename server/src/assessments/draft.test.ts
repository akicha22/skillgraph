import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVersionCopy,
  DraftValidationError,
  draftUpdateSchema,
  planDraftUpdate,
  publishIssues,
  scaleRubric,
  serializeDraft,
  type DraftUpdate,
  type DraftVersionRecord,
} from "./draft.js";
import { generatedAssessmentSchema } from "./schema.js";

type TaskPatch = NonNullable<DraftUpdate["tasks"]>[number];

const baseVersion: DraftVersionRecord = {
  id: "ver_1",
  assessmentId: "asm_1",
  versionNumber: 1,
  status: "DRAFT",
  requirementsText:
    "We need a junior operations associate who can analyse business data, communicate clearly with clients and negotiate basic vendor agreements.",
  title: "Junior Operations Associate Assessment",
  description: "A practical assessment covering sales analysis, client communication and vendor negotiation.",
  jobContext: "You are joining Northline Trading as a junior operations associate.",
  candidateInstructions:
    "Read every task before you start. You have 45 minutes in total. AI assistants are not allowed during this assessment.",
  targetLevel: "JUNIOR",
  difficulty: "INTERMEDIATE",
  aiPolicy: "NOT_ALLOWED",
  durationMinutes: 45,
  generationMethod: "TEMPLATE",
  generationModel: null,
  generatedAt: new Date("2026-11-17T09:00:00Z"),
  publishedAt: null,
  createdAt: new Date("2026-11-17T09:00:00Z"),
  updatedAt: new Date("2026-11-17T09:00:00Z"),
  assessment: { id: "asm_1", jobTitle: "Junior Operations Associate", companyName: "Northline Trading" },
  skills: [
    {
      skillId: "sk_excel",
      weight: 40,
      source: "REQUESTED",
      selectedSubskills: '["data-analysis"]',
      skill: {
        slug: "excel",
        name: "Excel",
        subskills: [
          { slug: "data-analysis", name: "Data Analysis" },
          { slug: "pivot-tables", name: "Pivot Tables" },
        ],
      },
    },
    {
      skillId: "sk_client",
      weight: 30,
      source: "REQUESTED",
      selectedSubskills: "[]",
      skill: { slug: "client-communication", name: "Client Communication", subskills: [] },
    },
    {
      skillId: "sk_neg",
      weight: 30,
      source: "SUGGESTED_APPROVED",
      selectedSubskills: "[]",
      skill: { slug: "negotiation", name: "Negotiation", subskills: [] },
    },
  ],
  tasks: [
    {
      id: "task_1",
      position: 0,
      type: "DATA_ANALYTICAL",
      title: "Sales Analysis — Retail",
      prompt: "You are a business analyst. Answer the four questions using the table provided and show your workings.",
      marks: 40,
      timeMinutes: 18,
      publicData: '{"table":{"columns":["month","product"]}}',
      privateData: '{"answerKey":{"total_revenue":123456},"rubric":[]}',
      skill: { slug: "excel", name: "Excel" },
      rubric: [
        { position: 0, name: "Total revenue", description: "Correct total revenue", maxMarks: 20, privateGuidance: "Expected 123456" },
        { position: 1, name: "Growth", description: "Correct growth percentage", maxMarks: 20, privateGuidance: "Expected 4.2" },
      ],
    },
    {
      id: "task_2",
      position: 1,
      type: "STRUCTURED_RESPONSE",
      title: "Reply to a client about a delayed delivery",
      prompt: "Write a reply email of at most 250 words to the client message shown in the scenario.",
      marks: 30,
      timeMinutes: 14,
      publicData: '{"wordLimit":250}',
      privateData: '{"evaluation":"RUBRIC_REVIEW","keyFacts":["delay of 4 days"]}',
      skill: { slug: "client-communication", name: "Client Communication" },
      rubric: [
        { position: 0, name: "Acknowledges the problem", description: "Names the delay and the concern", maxMarks: 15, privateGuidance: "Look for explicit acknowledgement" },
        { position: 1, name: "Practical next step", description: "Offers a concrete action", maxMarks: 15, privateGuidance: "Look for a date and an owner" },
      ],
    },
    {
      id: "task_3",
      position: 2,
      type: "STRUCTURED_RESPONSE",
      title: "Negotiate a supplier price increase",
      prompt: "Write your objective, walk-away point, the trade you would offer and an opening message to the supplier.",
      marks: 30,
      timeMinutes: 13,
      publicData: '{"wordLimit":150}',
      privateData: '{"evaluation":"RUBRIC_REVIEW","strongAnswerSignals":["states a walk-away point"]}',
      skill: { slug: "negotiation", name: "Negotiation" },
      rubric: [
        { position: 0, name: "Clear objectives", description: "States a target and a walk-away point", maxMarks: 20, privateGuidance: "Numbers must be justified" },
        { position: 1, name: "Commercially sensible trade", description: "Offers something in exchange", maxMarks: 10, privateGuidance: "Look for contract length or payment terms" },
      ],
    },
  ],
};

const clone = (): DraftVersionRecord => structuredClone(baseVersion);

function taskPatch(task: DraftVersionRecord["tasks"][number], overrides: Partial<TaskPatch> = {}): TaskPatch {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    marks: task.marks,
    timeMinutes: task.timeMinutes,
    ...overrides,
  };
}

function expectIssue(fn: () => void, field: string) {
  try {
    fn();
    assert.fail("expected DraftValidationError");
  } catch (err) {
    assert.ok(err instanceof DraftValidationError, `unexpected error: ${String(err)}`);
    assert.ok(
      err.issues.some((issue) => issue.field === field),
      `expected an issue on "${field}", got ${JSON.stringify(err.issues)}`,
    );
  }
}

// ---------- patch schema ----------

describe("draftUpdateSchema", () => {
  it("accepts a single field", () => {
    const parsed = draftUpdateSchema.safeParse({ title: " Updated title for the draft " });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.title, "Updated title for the draft");
  });

  it("rejects an empty update", () => {
    assert.equal(draftUpdateSchema.safeParse({}).success, false);
  });

  it("rejects fields outside the contract, such as answer keys", () => {
    assert.equal(
      draftUpdateSchema.safeParse({ title: "Valid title here", privateData: { answerKey: 1 } }).success,
      false,
    );
  });

  it("rejects a negative or oversized mark value", () => {
    const parsed = draftUpdateSchema.safeParse({
      tasks: [{ id: "task_1", title: "Sales analysis", prompt: "A long enough prompt body for validation.", marks: 0, timeMinutes: 10 }],
    });
    assert.equal(parsed.success, false);
  });
});

// ---------- serialization ----------

describe("serializeDraft", () => {
  it("returns totals, parsed JSON columns and subskill names", () => {
    const draft = serializeDraft(baseVersion);
    assert.equal(draft.editable, true);
    assert.deepEqual(draft.totals, { marks: 100, weights: 100, durationMinutes: 45, taskCount: 3 });
    assert.deepEqual(draft.skills[0].subskills, [{ slug: "data-analysis", name: "Data Analysis" }]);
    assert.equal(draft.tasks[0].publicData.table !== undefined, true);
    assert.deepEqual(draft.tasks[0].privateData.answerKey, { total_revenue: 123456 });
    assert.equal(draft.tasks[2].rubric[0].position, 0);
    assert.equal(draft.assessment.companyName, "Northline Trading");
  });

  it("marks published versions as not editable", () => {
    const published = { ...clone(), status: "PUBLISHED", publishedAt: new Date("2026-11-18T10:00:00Z") };
    assert.equal(serializeDraft(published).editable, false);
  });

  it("survives malformed JSON columns instead of throwing", () => {
    const broken = clone();
    broken.tasks[0].publicData = "not json";
    broken.skills[0].selectedSubskills = "not json";
    const draft = serializeDraft(broken);
    assert.deepEqual(draft.tasks[0].publicData, {});
    assert.deepEqual(draft.skills[0].subskills, []);
  });
});

// ---------- planning ----------

describe("planDraftUpdate", () => {
  it("updates wording without touching tasks or skills", () => {
    const plan = planDraftUpdate(clone(), { title: "Operations Associate (Practical)" });
    assert.equal(plan.version.title, "Operations Associate (Practical)");
    assert.equal(plan.version.durationMinutes, 45);
    assert.equal(plan.tasks, undefined);
    assert.equal(plan.skills, undefined);
    assert.deepEqual(plan.changed, ["title"]);
  });

  it("updates skill weights and subskills when they add up to 100", () => {
    const plan = planDraftUpdate(clone(), {
      skills: [
        { skillSlug: "excel", weight: 50, subskills: ["pivot-tables"] },
        { skillSlug: "client-communication", weight: 25 },
        { skillSlug: "negotiation", weight: 25 },
      ],
    });
    assert.ok(plan.skills);
    assert.equal(plan.skills.length, 3);
    const excel = plan.skills.find((s) => s.skillId === "sk_excel");
    assert.equal(excel?.weight, 50);
    // Omitted subskills keep the existing selection; provided ones are replaced.
    assert.deepEqual(JSON.parse(excel?.selectedSubskills ?? "[]"), ["pivot-tables"]);
    const client = plan.skills.find((s) => s.skillId === "sk_client");
    assert.deepEqual(JSON.parse(client?.selectedSubskills ?? "null"), []);
  });

  it("rejects weights that do not add up to 100", () => {
    expectIssue(
      () => planDraftUpdate(clone(), {
        skills: [
          { skillSlug: "excel", weight: 50 },
          { skillSlug: "client-communication", weight: 30 },
          { skillSlug: "negotiation", weight: 10 },
        ],
      }),
      "skills",
    );
  });

  it("rejects adding a skill that is not in the draft", () => {
    expectIssue(
      () => planDraftUpdate(clone(), {
        skills: [
          { skillSlug: "excel", weight: 50 },
          { skillSlug: "client-communication", weight: 25 },
          { skillSlug: "negotiation", weight: 20 },
          { skillSlug: "python", weight: 5 },
        ],
      }),
      "skills.python",
    );
  });

  it("rejects unknown subskills", () => {
    expectIssue(
      () => planDraftUpdate(clone(), {
        skills: [
          { skillSlug: "excel", weight: 40, subskills: ["macros"] },
          { skillSlug: "client-communication", weight: 30 },
          { skillSlug: "negotiation", weight: 30 },
        ],
      }),
      "skills.excel.subskills",
    );
  });

  it("rebalances rubric marks when task marks change", () => {
    const tasks = baseVersion.tasks.map((task) =>
      taskPatch(task, { marks: task.id === "task_1" ? 50 : task.id === "task_2" ? 25 : 25 }),
    );
    const plan = planDraftUpdate(clone(), { tasks });

    assert.ok(plan.tasks);
    assert.equal(plan.tasks.length, 3);
    for (const task of plan.tasks) {
      assert.equal(
        task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0),
        task.marks,
        `rubric must match marks for ${task.id}`,
      );
    }
    assert.equal(plan.tasks.reduce((sum, task) => sum + task.marks, 0), 100);
    // Original task order is preserved.
    assert.deepEqual(plan.tasks.map((t) => t.id), ["task_1", "task_2", "task_3"]);
  });

  it("keeps an explicitly supplied rubric that matches the marks", () => {
    const tasks = baseVersion.tasks.map((task) =>
      taskPatch(task, {
        rubric:
          task.id === "task_1"
            ? [
                { name: "Revenue", description: "Correct revenue total", maxMarks: 30, privateGuidance: "Expected 123456" },
                { name: "Growth", description: "Correct growth figure", maxMarks: 10, privateGuidance: "Expected 4.2" },
              ]
            : task.rubric.map(({ position: _position, ...criterion }) => criterion),
      }),
    );
    const plan = planDraftUpdate(clone(), { tasks });
    assert.ok(plan.tasks);
    assert.deepEqual(plan.tasks[0].rubric.map((c) => c.maxMarks), [30, 10]);
  });

  it("rejects a rubric that does not match the task marks", () => {
    const tasks = baseVersion.tasks.map((task) =>
      taskPatch(task, {
        rubric:
          task.id === "task_1"
            ? [{ name: "Revenue", description: "Correct revenue total", maxMarks: 10, privateGuidance: "Expected 123456" }]
            : task.rubric.map(({ position: _position, ...criterion }) => criterion),
      }),
    );
    expectIssue(() => planDraftUpdate(clone(), { tasks }), "tasks.task_1.rubric");
  });

  it("rejects task marks that do not add up to 100", () => {
    const tasks = baseVersion.tasks.map((task) => taskPatch(task, { marks: task.id === "task_1" ? 30 : task.marks }));
    expectIssue(() => planDraftUpdate(clone(), { tasks }), "tasks");
  });

  it("rejects a task that is not part of the draft", () => {
    const tasks = [
      ...baseVersion.tasks.map((task) => taskPatch(task)),
      taskPatch(baseVersion.tasks[0], { id: "task_extra" }),
    ];
    expectIssue(() => planDraftUpdate(clone(), { tasks }), "tasks.task_extra");
  });

  it("requires every existing task to be included", () => {
    const tasks = baseVersion.tasks.slice(0, 2).map((task) => taskPatch(task));
    expectIssue(() => planDraftUpdate(clone(), { tasks }), "tasks");
  });

  it("redistributes time when only the total duration changes", () => {
    const plan = planDraftUpdate(clone(), { durationMinutes: 60 });
    assert.ok(plan.tasks);
    assert.equal(plan.version.durationMinutes, 60);
    assert.equal(plan.tasks.reduce((sum, task) => sum + task.timeMinutes, 0), 60);
    for (const task of plan.tasks) {
      assert.ok(task.timeMinutes >= 1);
      assert.equal(task.rubric.reduce((sum, c) => sum + c.maxMarks, 0), task.marks);
    }
    // Marks are untouched by a time change.
    assert.deepEqual(plan.tasks.map((t) => t.marks), [40, 30, 30]);
  });

  it("takes the total from task times when tasks are edited", () => {
    const tasks = baseVersion.tasks.map((task) =>
      taskPatch(task, { timeMinutes: task.id === "task_1" ? 30 : task.id === "task_2" ? 20 : 25 }),
    );
    const plan = planDraftUpdate(clone(), { tasks });
    assert.equal(plan.version.durationMinutes, 75);
  });

  it("rejects a duration that contradicts the task times", () => {
    const tasks = baseVersion.tasks.map((task) => taskPatch(task));
    expectIssue(() => planDraftUpdate(clone(), { tasks, durationMinutes: 60 }), "durationMinutes");
  });

  it("rejects a duration shorter than the number of tasks", () => {
    expectIssue(() => planDraftUpdate(clone(), { durationMinutes: 2 }), "durationMinutes");
  });

  it("keeps private evaluation data out of the plan", () => {
    const plan = planDraftUpdate(clone(), { title: "Operations Associate (Practical)" });
    assert.equal(JSON.stringify(plan).includes("answerKey"), false);
  });
});

// ---------- rubric scaling ----------

describe("scaleRubric", () => {
  it("keeps relative weight when rescaling", () => {
    const rubric = [
      { name: "A", description: "First criterion", maxMarks: 10, privateGuidance: "guidance a" },
      { name: "B", description: "Second criterion", maxMarks: 20, privateGuidance: "guidance b" },
      { name: "C", description: "Third criterion", maxMarks: 30, privateGuidance: "guidance c" },
    ];
    const scaled = scaleRubric(rubric, 30);
    assert.equal(scaled.reduce((sum, c) => sum + c.maxMarks, 0), 30);
    assert.ok(scaled[2].maxMarks > scaled[0].maxMarks);
    assert.deepEqual(scaled.map((c) => c.name), ["A", "B", "C"]);
  });

  it("returns the rubric unchanged when the target is smaller than the criteria count", () => {
    const rubric = [
      { name: "A", description: "First criterion", maxMarks: 10, privateGuidance: "guidance a" },
      { name: "B", description: "Second criterion", maxMarks: 10, privateGuidance: "guidance b" },
    ];
    assert.deepEqual(scaleRubric(rubric, 1), rubric);
  });
});

// ---------- publish readiness (4D-2) ----------

describe("publishIssues", () => {
  it("accepts a complete draft", () => {
    assert.deepEqual(publishIssues(baseVersion), []);
  });

  it("reports skill weights that do not total 100", () => {
    const broken = clone();
    broken.skills[0].weight = 20;
    assert.ok(publishIssues(broken).some((issue) => issue.field === "skills"));
  });

  it("reports task marks that do not total 100", () => {
    const broken = clone();
    broken.tasks[0].marks = 30;
    broken.tasks[0].rubric = [
      { position: 0, name: "Revenue", description: "Correct revenue total", maxMarks: 30, privateGuidance: "Expected 123456" },
    ];
    assert.ok(publishIssues(broken).some((issue) => issue.field === "tasks" && /100/.test(issue.message)));
  });

  it("reports a rubric that does not match its task marks", () => {
    const broken = clone();
    broken.tasks[1].rubric[0].maxMarks = 5;
    assert.ok(publishIssues(broken).some((issue) => issue.field === `tasks.${broken.tasks[1].id}.rubric`));
  });

  it("reports a task with no rubric criteria", () => {
    const broken = clone();
    broken.tasks[2].rubric = [];
    assert.ok(publishIssues(broken).some((issue) => issue.field === `tasks.${broken.tasks[2].id}.rubric`));
  });

  it("reports a task that uses a skill outside the draft", () => {
    const broken = clone();
    broken.tasks[0].skill = { slug: "python", name: "Python" };
    assert.ok(publishIssues(broken).some((issue) => issue.field === `tasks.${broken.tasks[0].id}`));
  });

  it("reports a draft with no tasks", () => {
    const broken = clone();
    broken.tasks = [];
    assert.ok(publishIssues(broken).some((issue) => issue.field === "tasks"));
  });
});

// ---------- version copy (4D-2) ----------

describe("buildVersionCopy", () => {
  const published = (): DraftVersionRecord => ({
    ...clone(),
    status: "PUBLISHED",
    publishedAt: new Date("2026-11-20T10:00:00Z"),
  });

  it("copies a published version into a new draft", () => {
    const copy = buildVersionCopy(published(), 2, () => new Date("2026-12-01T00:00:00Z"));

    assert.equal(copy.versionNumber, 2);
    assert.equal(copy.status, "DRAFT");
    assert.equal(copy.assessmentId, "asm_1");
    assert.equal(copy.durationMinutes, 45);
    assert.equal(copy.skills.create.length, 3);
    assert.equal(copy.tasks.create.length, 3);
    assert.equal(copy.tasks.create[0].skillId, "sk_excel");
    assert.equal(copy.tasks.create[2].skillId, "sk_neg");
    assert.deepEqual(copy.tasks.create.map((t) => t.position), [0, 1, 2]);
    // Private evaluation data travels with the copy, otherwise scoring would change.
    assert.equal(copy.tasks.create[0].privateData, baseVersion.tasks[0].privateData);
    assert.equal(copy.tasks.create[1].publicData, baseVersion.tasks[1].publicData);
    assert.deepEqual(copy.tasks.create[0].rubric.create.map((r) => r.position), [0, 1]);
    assert.equal(copy.generatedAt.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(copy.title, baseVersion.title);
  });

  it("refuses to copy a task whose skill is not in the version", () => {
    const broken = published();
    broken.tasks[0].skill = { slug: "python", name: "Python" };
    assert.throws(
      () => buildVersionCopy(broken, 2),
      (err: unknown) => err instanceof DraftValidationError,
    );
  });
});

// ---------- cross-check against the generation content schema ----------

describe("draft invariants", () => {
  it("keeps an edited draft acceptable to the content schema", () => {
    const tasks = baseVersion.tasks.map((task) =>
      taskPatch(task, { marks: task.id === "task_1" ? 50 : task.id === "task_2" ? 20 : 30 }),
    );
    const plan = planDraftUpdate(clone(), { tasks, title: "Operations Associate (Practical)" });
    assert.ok(plan.tasks);

    const content = {
      title: plan.version.title ?? baseVersion.title,
      description: baseVersion.description,
      jobContext: baseVersion.jobContext,
      candidateInstructions: baseVersion.candidateInstructions,
      targetSkills: baseVersion.skills.map((skill) => ({
        skillSlug: skill.skill.slug,
        weight: skill.weight,
        subskills: [],
      })),
      tasks: plan.tasks.map((task, i) => {
        const source = baseVersion.tasks[i];
        return {
          type: source.type,
          skillSlug: source.skill.slug,
          title: task.title,
          prompt: task.prompt,
          marks: task.marks,
          timeMinutes: task.timeMinutes,
          publicData: {},
          privateData: {},
          rubric: task.rubric,
        };
      }),
    };

    assert.equal(generatedAssessmentSchema.safeParse(content).success, true);
  });
});
