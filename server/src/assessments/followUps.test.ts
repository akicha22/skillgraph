import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpQuestions, type FollowUpTaskInput } from "./followUps";

const TASKS: FollowUpTaskInput[] = [
  {
    id: "t1",
    title: "Recover the quarter",
    rubric: [
      { id: "c1", name: "Reads the position", maxMarks: 20, score: 4 },
      { id: "c2", name: "Plan and ownership", maxMarks: 20, score: 18 },
    ],
  },
  {
    id: "t2",
    title: "Handle the client complaint",
    rubric: [
      { id: "c3", name: "Acknowledges the customer", maxMarks: 10, score: null },
      { id: "c4", name: "Repair plan", maxMarks: 10, score: 5 },
    ],
  },
];

test("one question per task, weakest criterion first", () => {
  const questions = buildFollowUpQuestions(TASKS);
  assert.equal(questions.length, 2);
  // An unmarked criterion outranks a weak marked one; each task contributes at most one question.
  assert.deepEqual(
    questions.map((question) => question.criterionId),
    ["c3", "c1"],
  );
  assert.equal(questions[0].taskId, "t2");
  assert.equal(questions[0].reason, "Not marked yet");
  assert.equal(questions[1].reason, "Scored 4 of 20");
});

test("questions name the task and criterion so the recruiter can find them", () => {
  const [first] = buildFollowUpQuestions(TASKS);
  assert.match(first.question, /Handle the client complaint/);
  assert.match(first.question, /Acknowledges the customer/);
  assert.equal(first.taskTitle, "Handle the client complaint");
  assert.equal(first.criterion, "Acknowledges the customer");
  assert.equal(first.maxMarks, 10);
  assert.equal(first.score, null);
});

test("the limit is respected across many tasks", () => {
  const tasks: FollowUpTaskInput[] = Array.from({ length: 5 }, (_, index) => ({
    id: `t${index}`,
    title: `Task ${index}`,
    rubric: [{ id: `c${index}`, name: `Criterion ${index}`, maxMarks: 10, score: index }],
  }));

  const questions = buildFollowUpQuestions(tasks);
  assert.equal(questions.length, 3);
  // Lowest ratio first: scores 0, 1, 2 out of 10.
  assert.deepEqual(
    questions.map((question) => question.criterionId),
    ["c0", "c1", "c2"],
  );
  assert.equal(new Set(questions.map((question) => question.taskId)).size, 3);
});

test("a task with no criteria contributes nothing and empty input is safe", () => {
  assert.deepEqual(buildFollowUpQuestions([]), []);
  assert.deepEqual(
    buildFollowUpQuestions([{ id: "t", title: "Task", rubric: [] }]),
    [],
  );
});

test("questions are deterministic", () => {
  assert.deepEqual(buildFollowUpQuestions(TASKS), buildFollowUpQuestions(TASKS));
});
