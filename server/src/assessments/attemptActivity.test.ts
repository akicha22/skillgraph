import test from "node:test";
import assert from "node:assert/strict";
import { summariseActivity, type ActivityEvent } from "./attemptActivity";

const tasks = [
  { id: "task-one", position: 0, title: "Explain the delay" },
  { id: "task-two", position: 1, title: "Read the numbers" },
  { id: "task-three", position: 2, title: "Never opened" },
];

function event(
  type: string,
  taskId: string | null,
  iso: string,
  metadata: string | null = null,
): ActivityEvent {
  return { type, taskId, occurredAt: new Date(iso), metadata };
}

// Deliberately out of order: the summary must not depend on how the rows arrived.
const events: ActivityEvent[] = [
  event("ANSWER_SAVED", "task-one", "2026-11-20T10:20:00Z", JSON.stringify({ length: 900 })),
  event("TASK_OPENED", "task-one", "2026-11-20T10:00:00Z"),
  event("PASTE", "task-one", "2026-11-20T10:02:00Z", JSON.stringify({ length: 120 })),
  event("FOCUS_LOST", "task-one", "2026-11-20T10:03:00Z"),
  event("ANSWER_SAVED", "task-one", "2026-11-20T10:05:00Z", JSON.stringify({ length: 300 })),
  event("TASK_OPENED", "task-two", "2026-11-20T10:30:00Z"),
  event("ANSWER_SAVED", "task-two", "2026-11-20T10:31:00Z", JSON.stringify({ length: 50 })),
  event("SUBMITTED", null, "2026-11-20T10:32:00Z"),
];

test("summarises each task from its events", () => {
  const summary = summariseActivity(events, tasks);

  assert.equal(summary.eventCount, 8);
  assert.deepEqual(
    summary.tasks.map((task) => task.taskId),
    ["task-one", "task-two", "task-three"],
  );

  const [first, second, untouched] = summary.tasks;
  assert.equal(first.taskId, "task-one");
  assert.equal(first.firstOpenedAt, "2026-11-20T10:00:00.000Z");
  assert.equal(first.lastSavedAt, "2026-11-20T10:20:00.000Z");
  assert.equal(first.saveCount, 2);
  assert.equal(first.pasteCount, 1);
  assert.equal(first.pastedChars, 120);
  assert.equal(first.focusLostCount, 1);
  assert.equal(first.secondsFromOpenToLastSave, 1200);

  assert.equal(second.firstOpenedAt, "2026-11-20T10:30:00.000Z");
  assert.equal(second.saveCount, 1);
  assert.equal(second.pasteCount, 0);
  assert.equal(second.pastedChars, 0);
  assert.equal(second.focusLostCount, 0);
  assert.equal(second.secondsFromOpenToLastSave, 60);

  // A task with no events keeps its row, so an untouched task is visible rather than missing.
  assert.equal(untouched.taskId, "task-three");
  assert.equal(untouched.title, "Never opened");
  assert.equal(untouched.firstOpenedAt, null);
  assert.equal(untouched.lastSavedAt, null);
  assert.equal(untouched.saveCount, 0);
  assert.equal(untouched.secondsFromOpenToLastSave, null);

  // 10:00 to 10:32 is 32 minutes; the longest silence is the 15 minutes 10:05 to 10:20.
  assert.equal(summary.overall.totalSpanHours, 0.5);
  assert.equal(summary.overall.longestGapHours, 0.3);
  // Three saves and one paste: a quarter of the save-or-paste signals were pastes.
  assert.equal(summary.overall.pasteShare, 25);
});

test("returns zeroed rows and an empty overall when there are no events", () => {
  const summary = summariseActivity([], tasks);

  assert.equal(summary.eventCount, 0);
  assert.equal(summary.tasks.length, 3);
  for (const task of summary.tasks) {
    assert.equal(task.firstOpenedAt, null);
    assert.equal(task.lastSavedAt, null);
    assert.equal(task.saveCount, 0);
    assert.equal(task.pasteCount, 0);
    assert.equal(task.pastedChars, 0);
    assert.equal(task.focusLostCount, 0);
    assert.equal(task.secondsFromOpenToLastSave, null);
  }
  assert.deepEqual(summary.overall, {
    totalSpanHours: 0,
    longestGapHours: 0,
    pasteShare: 0,
  });
});

test("counts a paste but never reads text out of its metadata", () => {
  const summary = summariseActivity(
    [
      event(
        "PASTE",
        "task-one",
        "2026-11-20T10:02:00Z",
        JSON.stringify({ text: "the pasted sentence" }),
      ),
      event("PASTE", "task-one", "2026-11-20T10:04:00Z", "not json"),
      event("ANSWER_SAVED", "task-one", "2026-11-20T10:05:00Z"),
    ],
    tasks,
  );

  const first = summary.tasks[0];
  assert.equal(first.pasteCount, 2);
  assert.equal(first.pastedChars, 0);
  assert.equal(summary.overall.pasteShare, 67);
  assert.equal(JSON.stringify(summary).includes("pasted sentence"), false);
});
