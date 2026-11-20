import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyTasks, dayKey, shiftDayKey } from "./practice";
import { ALTERNATES, FORMATS, TYPED_BANKS } from "./typedBank";
import { gradeDailyAnswer } from "./dailyQuestions";
import { awardPoints, rankLeaderboard } from "./scoring";

const SKILLS = [
  { id: "s1", slug: "sales", name: "Sales" },
  { id: "s2", slug: "excel", name: "Excel" },
  { id: "s3", slug: "client-communication", name: "Client communication" },
  { id: "s4", slug: "graphic-design", name: "Graphic design" },
  { id: "s5", slug: "leadership", name: "Leadership" },
];

test("dayKey uses the local calendar day", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 10, 19, 0, 1)), "2026-11-19");
});

test("shiftDayKey crosses month and year boundaries", () => {
  assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDayKey("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDayKey("2026-01-31", 1), "2026-02-01");
  assert.equal(shiftDayKey("2026-11-19", 0), "2026-11-19");
});

test("a candidate with no skills gets no invented practice", () => {
  assert.deepEqual(
    buildDailyTasks({ candidateId: "cand-1", dateKey: "2026-11-19", skills: [] }),
    [],
  );
});

test("a day's set has ten drills, drawn only from the candidate's skills", () => {
  const tasks = buildDailyTasks({
    candidateId: "cand-1",
    dateKey: "2026-11-19",
    skills: SKILLS,
  });

  assert.equal(tasks.length, 10);
  assert.deepEqual(
    tasks.map((task) => task.position),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  const allowed = new Set(SKILLS.map((skill) => skill.id));
  for (const task of tasks) {
    assert.ok(allowed.has(task.skillId));
    assert.ok(task.title.includes(task.skillName));
    assert.equal(task.steps.length, 0);
  }
  assert.equal(new Set(tasks.map((task) => task.title.split(" · ")[1])).size, 10);
  // With cycling, some skills repeat across 10 positions.
  const skillIds = tasks.map((task) => task.skillId);
  const uniqueCount = new Set(skillIds).size;
  // The full selected skill list participates.
  assert.equal(tasks.length, 10);
  assert.equal(uniqueCount, SKILLS.length);
});

test("small skill sets still receive ten distinct challenges", () => {
  assert.equal(
    buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: [SKILLS[0]] }).length,
    10,
  );
  const two = buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: SKILLS.slice(0, 2) });
  assert.equal(two.length, 10);
  assert.equal(new Set(two.map((task) => task.skillId)).size, 2);
});

test("the same candidate and day always get the same drills", () => {
  const build = () =>
    buildDailyTasks({ candidateId: "cand-1", dateKey: "2026-11-19", skills: SKILLS });
  assert.deepEqual(build(), build());
});

test("a different day or candidate changes the practice set", () => {
  const base = buildDailyTasks({ candidateId: "cand-1", dateKey: "2026-11-19", skills: SKILLS });
  const nextDay = buildDailyTasks({ candidateId: "cand-1", dateKey: "2026-11-20", skills: SKILLS });
  const otherCandidate = buildDailyTasks({
    candidateId: "cand-2",
    dateKey: "2026-11-19",
    skills: SKILLS,
  });

  assert.notDeepEqual(base, nextDay);
  assert.notDeepEqual(base, otherCandidate);
});

test("difficulty climbs from warm-up to application and pays the matching points", () => {
  const tasks = buildDailyTasks({
    candidateId: "cand-1",
    dateKey: "2026-11-19",
    skills: SKILLS,
  });

  assert.deepEqual(
    tasks.map((task) => task.difficulty),
    [
      "BEGINNER",
      "BEGINNER",
      "BEGINNER",
      "INTERMEDIATE",
      "INTERMEDIATE",
      "INTERMEDIATE",
      "INTERMEDIATE",
      "ADVANCED",
      "ADVANCED",
      "ADVANCED",
    ],
  );
  const tierPoints = { BEGINNER: 5, INTERMEDIATE: 10, ADVANCED: 15 };
  for (const task of tasks) {
    assert.equal(task.points, task.questionType === "SELF_REVIEW" ? 0 : tierPoints[task.difficulty]);
  }
});

test("the curated banks have unique concepts, single prompts and evaluation criteria", () => {
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const bank of [...Object.values(TYPED_BANKS), ...Object.values(ALTERNATES).map((alternates) => Object.values(alternates).filter((entry) => entry !== undefined))]) {
    for (const [id, brief, prompt, criteria, answer] of bank) {
      assert.ok(!ids.has(id), id);
      assert.ok(!prompts.has(prompt), prompt);
      ids.add(id);
      prompts.add(prompt);
      assert.ok(brief && criteria);
      assert.match(prompt, /^[^?!]+[.]$/);
      if (answer) assert.ok(gradeDailyAnswer("SHORT_TEXT", [answer], answer));
    }
  }
});

test("dedicated skills select their own tiered concepts", () => {
  for (const [slug, bank] of Object.entries(TYPED_BANKS)) {
    const tasks = buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: [{ id: slug, slug, name: slug }] });
    assert.deepEqual(tasks.map((task) => task.concept), bank.map(([id]) => id));
    assert.deepEqual(tasks.map((task) => task.title.split(" · ")[1]), FORMATS);
    for (const task of tasks) {
      assert.equal(task.skillId, slug);
      assert.notEqual(task.questionType, "NUMBER");
      assert.equal(gradeDailyAnswer(task.questionType, task.acceptedAnswers, "generic answer"), false);
      assert.ok(task.explanation);
    }
  }
});

test("a one-skill profile can get different concepts without repeating formats", () => {
  const input = { candidateId: "c", skills: [SKILLS[1]] };
  const previous = buildDailyTasks({ ...input, dateKey: "2026-11-19" });
  const next = buildDailyTasks({ ...input, dateKey: "2026-11-20" });
  assert.notDeepEqual(previous.map((task) => task.concept), next.map((task) => task.concept));
  assert.deepEqual(previous.map((task) => task.title), next.map((task) => task.title));
});

test("unsupported skills never get unrelated tasks, even beside a supported skill", () => {
  const unsupported = { id: "unsupported", slug: "surveying", name: "Surveying" };
  const input = { candidateId: "c", dateKey: "2026-11-19", jobTitle: "Graphic designer" };
  assert.deepEqual(buildDailyTasks({ ...input, skills: [unsupported] }), []);
  const tasks = buildDailyTasks({ ...input, skills: [unsupported, SKILLS[1]] });
  assert.equal(tasks.length, 10);
  assert.ok(tasks.every((task) => task.skillId === SKILLS[1].id));
});

test("SQL, civil engineering and video editing require distinct job-specific work", () => {
  function setFor(slug: string) {
    return buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: [{ id: slug, slug, name: slug }] });
  }
  const sql = setFor("sql");
  assert.match(sql[3].scenario, /orders\(order_id, customer_id, amount, order_date\)/);
  assert.match(sql[3].question, /Write a query/);
  assert.match(sql[4].explanation, /HAVING/);
  assert.match(sql[7].scenario, /INNER JOIN.*LEFT JOIN/);
  assert.match(sql[8].explanation, /execution plan/);
  const civil = setFor("civil-engineering");
  assert.match(civil[0].explanation, /3\.6 m³/);
  assert.match(civil[7].explanation, /drainage/);
  const video = setFor("video-editing");
  assert.match(video[3].scenario, /vertical reel/);
  assert.match(video[8].question, /pacing edit/);
});

test("numeric answers tolerate currency symbols, commas and rounding", () => {
  assert.equal(gradeDailyAnswer("NUMBER", ["57600"], "₹57,600"), true);
  assert.equal(gradeDailyAnswer("NUMBER", ["57600"], "57600.00"), true);
  assert.equal(gradeDailyAnswer("NUMBER", ["57600"], "56,000"), false);
  assert.equal(gradeDailyAnswer("SHORT_TEXT", ["14:15", "2:15 pm"], "2:15 PM"), true);
  assert.equal(gradeDailyAnswer("SHORT_TEXT", ["14:15"], "15:15"), false);
});

test("points are full on the first attempt and halved after a wrong one", () => {
  assert.equal(awardPoints(15, 0), 15);
  assert.equal(awardPoints(15, 1), 7);
  assert.equal(awardPoints(10, 3), 5);
  assert.equal(awardPoints(5, 1), 2);
  assert.equal(awardPoints(1, 1), 1);
  assert.equal(awardPoints(10, 0), 10);
});

test("the leaderboard ranks by points and shares rank on a tie", () => {
  const ranked = rankLeaderboard([
    { candidateId: "a", name: "Asha", points: 30, tasksSolved: 3 },
    { candidateId: "b", name: "Bilal", points: 55, tasksSolved: 5 },
    { candidateId: "c", name: "Chen", points: 30, tasksSolved: 4 },
    { candidateId: "d", name: "Dana", points: 10, tasksSolved: 1 },
  ]);

  assert.deepEqual(
    ranked.map((row) => [row.name, row.rank]),
    [
      ["Bilal", 1],
      ["Chen", 2],
      ["Asha", 2],
      ["Dana", 4],
    ],
  );
});

test("practice drills are on-topic and carry no assessment vocabulary", () => {
  const tasks = buildDailyTasks({
    candidateId: "cand-1",
    dateKey: "2026-11-19",
    skills: SKILLS,
  });
  for (const task of tasks) {
    assert.doesNotMatch(task.scenario, /undefined|null|NaN/);
    assert.doesNotMatch(task.scenario, /marks|rubric/i);
    assert.equal(task.minutes, task.position < 3 ? 1 : task.position < 7 ? 2 : 3);
    assert.ok(task.scenario.length > 20);
  }
});
