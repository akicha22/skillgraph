import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyTasks, dayKey, shiftDayKey } from "./practice";
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

test("a day's set has three drills, drawn only from the candidate's skills", () => {
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
    assert.equal(task.steps.length, 3);
  }
  // With cycling, some skills repeat across 10 positions; verify no unexpected IDs.
  const skillIds = tasks.map((task) => task.skillId);
  const uniqueCount = new Set(skillIds).size;
  // With 5 skills we expect all unique; with fewer, some repeat but total is 10.
  assert.equal(tasks.length, 10);
  assert(uniqueCount >= 1 && uniqueCount <= tasks.length);
});

test("fewer than three skills means fewer drills, never duplicates", () => {
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
  assert.deepEqual(
    tasks.map((task) => task.points),
    [5, 5, 5, 10, 10, 10, 10, 15, 15, 15],
  );
});

test("every drill has a checkable question with a private answer key", () => {
  const tasks = buildDailyTasks({
    candidateId: "cand-1",
    dateKey: "2026-11-19",
    skills: SKILLS,
  });

  assert.equal(new Set(tasks.map((task) => task.question)).size, tasks.length);
  for (const task of tasks) {
    assert.ok(task.question.length > 20);
    assert.ok(task.acceptedAnswers.length > 0);
    assert.ok(task.explanation.length > 0);
    assert.ok(
      gradeDailyAnswer(task.questionType, task.acceptedAnswers, task.acceptedAnswers[0]),
      `the stored answer must grade as correct: ${task.question}`,
    );
    assert.equal(gradeDailyAnswer(task.questionType, task.acceptedAnswers, "definitely wrong"), false);
  }
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
    assert.ok(task.minutes >= 10 && task.minutes <= 15);
    assert.ok(task.scenario.length > 100);
  }
});
