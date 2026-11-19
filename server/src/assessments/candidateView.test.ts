import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeCandidateVersion } from "./candidateView.js";

// The stored record as the database holds it, private columns included.
const version = {
  title: "Junior Operations Associate Assessment",
  description: "A practical assessment covering sales analysis and vendor negotiation.",
  jobContext: "You are joining Northline Trading as a junior operations associate.",
  candidateInstructions: "Answer every task. AI assistants are not allowed.",
  targetLevel: "JUNIOR",
  difficulty: "INTERMEDIATE",
  aiPolicy: "NOT_ALLOWED",
  durationMinutes: 45,
  // Recruiter-only columns that must never be forwarded.
  requirementsText: "We need someone who can analyse sales data and negotiate with suppliers.",
  generationModel: "gemini-test",
  assessment: { jobTitle: "Junior Operations Associate", companyName: "Northline Trading" },
  tasks: [
    {
      id: "task_1",
      position: 0,
      type: "DATA_ANALYTICAL",
      title: "Sales Analysis — Retail",
      prompt: "Answer the four questions using the table. Show your workings.",
      marks: 40,
      timeMinutes: 18,
      publicData: JSON.stringify({ table: { columns: ["month", "revenue"] } }),
      privateData: JSON.stringify({ answerKey: { total_revenue: 987654 } }),
      skill: { name: "Excel" },
      rubric: [
        {
          position: 0,
          name: "Total revenue",
          description: "Correct total revenue",
          maxMarks: 20,
          privateGuidance: "Expected 987654",
        },
      ],
    },
  ],
};

describe("serializeCandidateVersion — before the candidate starts", () => {
  const view = serializeCandidateVersion(version, false);

  it("describes each task by topic only, with no title, prompt, data or criteria", () => {
    assert.equal(view.started, false);
    assert.equal(view.tasks.length, 1);
    assert.equal(view.tasks[0].title, null);
    assert.equal(view.tasks[0].prompt, null);
    assert.deepEqual(view.tasks[0].publicData, {});
    assert.deepEqual(view.tasks[0].rubric, []);
    // What the candidate needs to decide whether to begin is still there.
    assert.equal(view.tasks[0].type, "DATA_ANALYTICAL");
    assert.equal(view.tasks[0].skillName, "Excel");
    assert.equal(view.tasks[0].marks, 40);
    assert.equal(view.tasks[0].timeMinutes, 18);
  });
});

describe("serializeCandidateVersion — after the candidate starts", () => {
  const view = serializeCandidateVersion(version, true);

  it("sends the question and the data the task publishes", () => {
    assert.equal(view.started, true);
    assert.equal(view.tasks[0].title, "Sales Analysis — Retail");
    assert.equal(view.tasks[0].prompt, version.tasks[0].prompt);
    assert.deepEqual(view.tasks[0].publicData, { table: { columns: ["month", "revenue"] } });
  });

  it("sends only the candidate-facing rubric fields", () => {
    assert.deepEqual(Object.keys(view.tasks[0].rubric[0]).sort(), [
      "description",
      "maxMarks",
      "name",
      "position",
    ]);
    assert.deepEqual(view.tasks[0].rubric[0], {
      position: 0,
      name: "Total revenue",
      description: "Correct total revenue",
      maxMarks: 20,
    });
  });
});

describe("serializeCandidateVersion — privacy", () => {
  for (const started of [false, true]) {
    it(`never carries privateData, answerKey or privateGuidance (started: ${started})`, () => {
      const json = JSON.stringify(serializeCandidateVersion(version, started));
      assert.equal(json.includes("privateData"), false);
      assert.equal(json.includes("answerKey"), false);
      assert.equal(json.includes("privateGuidance"), false);
      // The expected value itself must not leak through either.
      assert.equal(json.includes("987654"), false);
    });
  }

  it("keeps recruiter-only bookkeeping out of the view", () => {
    const json = JSON.stringify(serializeCandidateVersion(version, true));
    assert.equal(json.includes("requirementsText"), false);
    assert.equal(json.includes("generationModel"), false);
    assert.equal("requirementsText" in serializeCandidateVersion(version, true), false);
  });

  it("survives a malformed publicData column instead of throwing", () => {
    const broken = {
      ...version,
      tasks: [{ ...version.tasks[0], publicData: "not json" }],
    };
    assert.deepEqual(serializeCandidateVersion(broken, true).tasks[0].publicData, {});
  });
});
