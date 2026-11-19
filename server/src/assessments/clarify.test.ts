import test from "node:test";
import assert from "node:assert/strict";
import { clarificationQuestions, mergeClarifications } from "./clarify";

const RICH_BRIEF =
  "We need a Sales Head for our B2B industrial safety equipment business in Karnataka. They will " +
  "manage a team of 8 and use Salesforce. The monthly target is ₹25 lakh and the team is at 68% " +
  "with 10 days left in the quarter.";

const THIN_BRIEF = "We need a Sales Head to manage the sales team and grow revenue.";

test("a brief that already has the details is not interrupted with questions", () => {
  assert.deepEqual(
    clarificationQuestions({
      requirementsText: RICH_BRIEF,
      jobTitle: "Sales Head",
      targetLevel: "SENIOR",
      skillSlugs: ["sales"],
      skillNames: ["Sales"],
    }),
    [],
  );
});

test("a thin sales brief asks about product, market and scale, and stops at three", () => {
  const questions = clarificationQuestions({
    requirementsText: THIN_BRIEF,
    jobTitle: "Sales Head",
    targetLevel: "SENIOR",
    skillSlugs: ["sales"],
    skillNames: ["Sales"],
  });

  assert.deepEqual(
    questions.map((question) => question.id),
    ["product", "market", "scale"],
  );
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  for (const question of questions) {
    assert.ok(question.question.endsWith("?"));
    assert.ok(question.why.length > 20);
    assert.ok(question.placeholder.length > 0);
  }
});

test("the team question is asked only for a role that could manage people", () => {
  const brief =
    "A junior data analyst for our B2B logistics product, working on daily transaction reports " +
    "with SQL and Excel. The target is 40 reports a month.";
  const withoutPeople = clarificationQuestions({
    requirementsText: brief,
    jobTitle: "Data analyst",
    targetLevel: "JUNIOR",
    skillSlugs: ["excel"],
  });
  assert.equal(
    withoutPeople.some((question) => question.id === "team"),
    false,
  );

  const withPeople = clarificationQuestions({
    requirementsText: brief,
    jobTitle: "Head of data",
    targetLevel: "SENIOR",
    skillSlugs: ["excel"],
  });
  assert.equal(
    withPeople.some((question) => question.id === "team"),
    true,
  );
});

test("tools are asked about only where the work uses them", () => {
  const sales = clarificationQuestions({
    requirementsText:
      "Selling industrial pumps to B2B factories. Monthly target of ₹20 lakh, managed by a team of 5.",
    jobTitle: "Sales manager",
    targetLevel: "MID",
    skillSlugs: ["sales"],
  });
  assert.equal(
    sales.some((question) => question.id === "tools"),
    false,
  );

  const data = clarificationQuestions({
    requirementsText:
      "Producing the monthly sales report for our B2B leadership team, with a target of 12 reports a quarter.",
    jobTitle: "Data analyst",
    targetLevel: "JUNIOR",
    skillSlugs: ["data-analysis"],
  });
  assert.equal(
    data.some((question) => question.id === "tools"),
    true,
  );
});

test("figures count as scale whether they are money, percentages or volumes", () => {
  for (const brief of [
    "Selling software to B2B clients. The target is ₹25 lakh a month with a team of 6.",
    "Selling software to B2B clients. We need 400 new customers this year with a team of 6.",
    "Selling software to B2B clients. The team is at 68% of plan with a team of 6.",
  ]) {
    const questions = clarificationQuestions({
      requirementsText: brief,
      jobTitle: "Sales manager",
      targetLevel: "MID",
      skillSlugs: ["sales"],
    });
    assert.equal(
      questions.some((question) => question.id === "scale"),
      false,
      `scale should not be asked for: ${brief}`,
    );
  }
});

test("mergeClarifications folds answers into the brief and ignores blank ones", () => {
  const merged = mergeClarifications(THIN_BRIEF, [
    { question: "What will they sell?", answer: "  Industrial safety equipment.  " },
    { question: "Which market?", answer: "   " },
    { question: "What scale?", answer: "" },
  ]);

  assert.ok(merged.startsWith(THIN_BRIEF));
  assert.match(merged, /Additional context from the recruiter/);
  assert.match(merged, /- What will they sell\? Industrial safety equipment\./);
  assert.doesNotMatch(merged, /Which market/);
});

test("mergeClarifications leaves the brief untouched when nothing was answered", () => {
  assert.equal(
    mergeClarifications(THIN_BRIEF, [{ question: "What will they sell?", answer: "  " }]),
    THIN_BRIEF,
  );
  assert.equal(mergeClarifications(THIN_BRIEF, []), THIN_BRIEF);
});

test("merged requirements stay within the 3000-character brief limit", () => {
  const longBrief = "a".repeat(2900);
  const merged = mergeClarifications(longBrief, [
    { question: "What will they sell?", answer: "b".repeat(500) },
  ]);
  assert.ok(merged.length <= 3000);
  assert.ok(merged.startsWith("a".repeat(2900)));
});
