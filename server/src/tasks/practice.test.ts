import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyTasks, dayKey, shiftDayKey } from "./practice";

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

  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((task) => task.position),
    [0, 1, 2],
  );
  const allowed = new Set(SKILLS.map((skill) => skill.id));
  for (const task of tasks) {
    assert.ok(allowed.has(task.skillId));
    assert.ok(task.title.includes(task.skillName));
    assert.equal(task.steps.length, 3);
  }
  // A set never repeats one skill when others are available.
  assert.equal(new Set(tasks.map((task) => task.skillId)).size, tasks.length);
});

test("fewer than three skills means fewer drills, never duplicates", () => {
  assert.equal(
    buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: [SKILLS[0]] }).length,
    1,
  );
  const two = buildDailyTasks({ candidateId: "c", dateKey: "2026-11-19", skills: SKILLS.slice(0, 2) });
  assert.equal(two.length, 2);
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
