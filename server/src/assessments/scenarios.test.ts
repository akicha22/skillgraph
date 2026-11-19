import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeDrill, buildScenarioTask, detectFamily } from "./scenarios";

/**
 * The scenario engine replaced a generic placeholder with concrete cases. These tests pin the
 * behaviour that matters: the right family, facts carried from the brief, a deliverable, criteria
 * that add up, and no invented gaps or "undefined" text.
 */

const SALES_BRIEF =
  "We need a Sales Head managing a team of 6. The monthly target is Rs 25 lakh and the team is at " +
  "68% with 10 days left. We sell industrial safety equipment to B2B factories in Karnataka.";

test("detectFamily uses the skill first and the brief second", () => {
  assert.equal(detectFamily("sales", "Sales", ""), "SALES");
  assert.equal(detectFamily("graphic-design", "Graphic design", ""), "CREATIVE");
  assert.equal(detectFamily("web-development", "Web development", ""), "TECHNICAL");
  assert.equal(detectFamily("leadership", "Leadership", ""), "PEOPLE");
  assert.equal(detectFamily("excel", "Excel", ""), "DATA");
  assert.equal(detectFamily("time-management", "Time management", ""), "PEOPLE");
  assert.equal(detectFamily("curiosity", "Curiosity", ""), "GENERAL");
  // An ambiguous skill name is decided by what the recruiter actually described.
  assert.equal(detectFamily("collaboration", "Collaboration", "customer support for enterprise clients"), "SERVICE");
});

test("a sales brief becomes a case with its own figures, constraints and deliverable", () => {
  const task = buildScenarioTask({
    seed: 42,
    skillSlug: "sales",
    skillName: "Sales",
    jobTitle: "Sales Head",
    companyName: "Meridian Supplies",
    requirementsText: SALES_BRIEF,
  });

  assert.match(task.title, /^Sales: /);
  assert.match(task.title, /25 lakh/);
  assert.match(task.prompt, /Sales Head at Meridian Supplies/);
  assert.match(task.prompt, /₹25 lakh/);
  assert.match(task.prompt, /68%/);
  assert.match(task.prompt, /₹8 lakh/);
  assert.match(task.prompt, /10 days/);
  assert.match(task.prompt, /team of 6/);
  assert.match(task.prompt, /12% gross margin/);
  assert.match(task.prompt, /At most \d+ words/);
  // The placeholder the recruiter complained about must never come back.
  assert.doesNotMatch(task.prompt, /realistic situation/i);
  // The prompt is a complete brief: a situation, a constraint and a question/deliverable.
  assert.ok(task.prompt.split(/\n\n/).length >= 3);
  assert.ok(task.prompt.length > 500);
});

test("rubric criteria are complete, add up to 100 and carry private guidance", () => {
  for (const slug of ["sales", "client-communication", "excel", "graphic-design", "python"]) {
    const task = buildScenarioTask({ seed: 3, skillSlug: slug, skillName: slug });
    const total = task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
    assert.equal(total, 100, `${slug}: rubric must total 100`);
    assert.ok(task.rubric.length >= 4, `${slug}: has enough criteria to mark meaningfully`);
    for (const criterion of task.rubric) {
      assert.ok(criterion.name.length >= 2);
      assert.ok(criterion.description.length >= 5);
      assert.ok(criterion.privateGuidance.length >= 5);
      assert.ok(criterion.maxMarks >= 1);
    }
    assert.equal(task.privateData.evaluation, "RUBRIC_REVIEW");
    assert.ok(Array.isArray(task.privateData.keyFacts));
    assert.ok(Array.isArray(task.privateData.redFlags));
  }
});

test("each family produces its own kind of task", () => {
  const cases: [string, RegExp][] = [
    ["client-communication", /reply to the customer/i],
    ["excel", /analysis plan/i],
    ["python", /technical plan/i],
    ["graphic-design", /design response/i],
    ["leadership", /conversations you will have/i],
    ["time-management", /plan for the next 30 days/i],
  ];
  for (const [slug, expected] of cases) {
    const task = buildScenarioTask({ seed: 11, skillSlug: slug, skillName: slug });
    assert.match(task.prompt, expected, `${slug}: wrong scenario family`);
  }
});

test("the same seed and brief always produce the same task", () => {
  const build = () =>
    buildScenarioTask({
      seed: 99,
      skillSlug: "negotiation",
      skillName: "Negotiation",
      jobTitle: "Buyer",
      companyName: "Northline",
      requirementsText: "Negotiate supplier terms; the contract is worth Rs 40 lakh a year.",
    });
  assert.deepEqual(build(), build());
});

test("different seeds vary the case instead of cloning one template", () => {
  const prompts = new Set(
    Array.from({ length: 12 }, (_, seed) =>
      buildScenarioTask({ seed, skillSlug: "sales", skillName: "Sales" }).prompt,
    ),
  );
  assert.ok(prompts.size > 1);
});

test("a brief without a role, company or figures still reads cleanly", () => {
  const task = buildScenarioTask({ seed: 5, skillSlug: "curiosity", skillName: "Curiosity" });
  assert.doesNotMatch(task.prompt, /undefined|null|NaN/);
  assert.match(task.prompt, /mid-sized company/);
  assert.match(task.prompt, /₹/);
  assert.doesNotMatch(task.prompt, /A realistic situation arises/);
});

test("practice drills are short, on-topic and unmarked", () => {
  const drill = buildPracticeDrill({
    seed: 7,
    skillSlug: "graphic-design",
    skillName: "Graphic design",
  });
  assert.equal(drill.family, "CREATIVE");
  assert.match(drill.scenario, /designer/);
  // A concrete creative situation, not a generic "workplace scenario".
  assert.match(drill.scenario, /handover|launch|rebrand/);
  assert.equal(drill.steps.length, 3);
  assert.ok(drill.minutes >= 10 && drill.minutes <= 15);

  const second = buildPracticeDrill({
    seed: 7,
    skillSlug: "graphic-design",
    skillName: "Graphic design",
  });
  assert.deepEqual(drill, second);

  // Practice has no rubric, marks or deliverable — it is a drill, not an exam.
  assert.equal("rubric" in drill, false);
  assert.equal("marks" in drill, false);
  assert.equal("deliverable" in drill, false);
});

test("practice names the work instead of inventing a senior title", () => {
  for (const slug of ["sales", "client-communication", "excel", "graphic-design", "python"]) {
    const drill = buildPracticeDrill({ seed: 1, skillSlug: slug, skillName: slug });
    assert.doesNotMatch(drill.scenario, /senior manager/);
    assert.doesNotMatch(drill.scenario, /undefined|null/);
  }
});
