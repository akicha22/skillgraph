import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TYPES,
  attemptEventBatchSchema,
  buildAnswerSavedMetadata,
} from "./attemptEvents";

test("EVENT_TYPES contains exactly the supported event names", () => {
  assert.deepEqual(EVENT_TYPES, [
    "TASK_OPENED",
    "ANSWER_SAVED",
    "PASTE",
    "FOCUS_LOST",
    "FOCUS_RESTORED",
    "SUBMITTED",
  ]);
});

test("buildAnswerSavedMetadata reports counts from an empty answer", () => {
  assert.deepEqual(buildAnswerSavedMetadata(undefined, "hello"), {
    length: 5,
    previousLength: 0,
    delta: 5,
  });
  assert.deepEqual(buildAnswerSavedMetadata(null, ""), {
    length: 0,
    previousLength: 0,
    delta: 0,
  });
});

test("buildAnswerSavedMetadata reports growth and shrinkage", () => {
  assert.deepEqual(buildAnswerSavedMetadata("hello", "hello world"), {
    length: 11,
    previousLength: 5,
    delta: 6,
  });
  assert.deepEqual(buildAnswerSavedMetadata("hello world", "hello"), {
    length: 5,
    previousLength: 11,
    delta: -6,
  });
  assert.deepEqual(buildAnswerSavedMetadata("same", "same"), {
    length: 4,
    previousLength: 4,
    delta: 0,
  });
});

test("the batch schema accepts up to 50 valid events", () => {
  const events = Array.from({ length: 50 }, (_, index) => ({
    type: EVENT_TYPES[index % EVENT_TYPES.length],
    taskId: `task-${index}`,
    metadata: { index, kind: "short" },
  }));

  const parsed = attemptEventBatchSchema.safeParse({ events });
  assert.equal(parsed.success, true);
});

test("the batch schema rejects more than 50 events", () => {
  const events = Array.from({ length: 51 }, () => ({ type: "TASK_OPENED" }));
  assert.equal(attemptEventBatchSchema.safeParse({ events }).success, false);
});

test("the batch schema rejects an unknown event type", () => {
  const parsed = attemptEventBatchSchema.safeParse({
    events: [{ type: "COPIED_ANSWER" }],
  });
  assert.equal(parsed.success, false);
});

test("taskId and metadata are optional", () => {
  assert.equal(attemptEventBatchSchema.safeParse({ events: [{ type: "SUBMITTED" }] }).success, true);
});

test("metadata accepts only numbers and short strings", () => {
  assert.equal(
    attemptEventBatchSchema.safeParse({
      events: [{ type: "PASTE", metadata: { count: 2, field: "answer" } }],
    }).success,
    true,
  );

  assert.equal(
    attemptEventBatchSchema.safeParse({
      events: [{ type: "PASTE", metadata: { nested: { count: 2 } } }],
    }).success,
    false,
  );

  assert.equal(
    attemptEventBatchSchema.safeParse({
      events: [{ type: "PASTE", metadata: { text: "x".repeat(101) } }],
    }).success,
    false,
  );
});

test("metadata whose JSON reaches 500 characters is rejected", () => {
  const metadata = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [`key${index}`, "x".repeat(100)]),
  );
  assert.ok(JSON.stringify(metadata).length >= 500);

  assert.equal(
    attemptEventBatchSchema.safeParse({
      events: [{ type: "PASTE", metadata }],
    }).success,
    false,
  );
});
