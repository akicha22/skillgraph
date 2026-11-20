/**
 * Turns a submitted attempt's activity rows into per-task counts for the recruiter who owns it.
 *
 * Only what was stored is summarised: the event type, when it happened and — for a paste — its
 * length. Answer text and pasted text were never stored, so they cannot leak from here.
 */

/** One stored AttemptEvent, as this summary needs it. */
export type ActivityEvent = {
  type: string;
  taskId: string | null;
  occurredAt: Date;
  metadata: string | null;
};

export type ActivityTask = { id: string; position: number; title: string };

export type TaskActivity = {
  taskId: string;
  position: number;
  title: string;
  firstOpenedAt: string | null;
  lastSavedAt: string | null;
  saveCount: number;
  pasteCount: number;
  pastedChars: number;
  focusLostCount: number;
  /** Seconds from the first TASK_OPENED to the last ANSWER_SAVED; null if either is missing. */
  secondsFromOpenToLastSave: number | null;
};

export type ActivitySummary = {
  eventCount: number;
  tasks: TaskActivity[];
  overall: {
    /** First signal to last signal, in hours. */
    totalSpanHours: number;
    /** The longest silence between two consecutive signals, in hours. */
    longestGapHours: number;
    /** Share of save-or-paste signals that were pastes, as a whole percentage. */
    pasteShare: number;
  };
};

const HOUR_MS = 60 * 60 * 1000;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The pasted length from a PASTE event's metadata; unreadable or missing reads as 0. */
function pastedCharsOf(metadata: string | null): number {
  if (!metadata) return 0;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return 0;
    const length = (parsed as { length?: unknown }).length;
    return typeof length === "number" && Number.isFinite(length) && length > 0
      ? Math.round(length)
      : 0;
  } catch {
    return 0;
  }
}

/**
 * Per task, the signals that belong to it; overall, the shape of the whole session. Tasks with no
 * events still get a row of zeroes so an untouched task is visible rather than missing.
 */
export function summariseActivity(
  events: ActivityEvent[],
  tasks: ActivityTask[],
): ActivitySummary {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const rows: TaskActivity[] = [...tasks]
    .sort((a, b) => a.position - b.position)
    .map((task) => {
      let firstOpened: Date | null = null;
      let lastSaved: Date | null = null;
      let saveCount = 0;
      let pasteCount = 0;
      let pastedChars = 0;
      let focusLostCount = 0;

      for (const event of ordered) {
        if (event.taskId !== task.id) continue;
        if (event.type === "TASK_OPENED") {
          if (!firstOpened || event.occurredAt < firstOpened) firstOpened = event.occurredAt;
        } else if (event.type === "ANSWER_SAVED") {
          saveCount += 1;
          if (!lastSaved || event.occurredAt > lastSaved) lastSaved = event.occurredAt;
        } else if (event.type === "PASTE") {
          pasteCount += 1;
          pastedChars += pastedCharsOf(event.metadata);
        } else if (event.type === "FOCUS_LOST") {
          focusLostCount += 1;
        }
      }

      return {
        taskId: task.id,
        position: task.position,
        title: task.title,
        firstOpenedAt: firstOpened ? firstOpened.toISOString() : null,
        lastSavedAt: lastSaved ? lastSaved.toISOString() : null,
        saveCount,
        pasteCount,
        pastedChars,
        focusLostCount,
        secondsFromOpenToLastSave:
          firstOpened && lastSaved
            ? Math.max(
                0,
                Math.round((lastSaved.getTime() - firstOpened.getTime()) / 1000),
              )
            : null,
      };
    });

  let longestGapMs = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const gap = ordered[index].occurredAt.getTime() - ordered[index - 1].occurredAt.getTime();
    if (gap > longestGapMs) longestGapMs = gap;
  }

  const totalPastes = rows.reduce((sum, row) => sum + row.pasteCount, 0);
  const totalSaves = rows.reduce((sum, row) => sum + row.saveCount, 0);
  const saveOrPasteSignals = totalPastes + totalSaves;
  const spanMs =
    ordered.length < 2
      ? 0
      : ordered[ordered.length - 1].occurredAt.getTime() - ordered[0].occurredAt.getTime();

  return {
    eventCount: ordered.length,
    tasks: rows,
    overall: {
      totalSpanHours: round1(spanMs / HOUR_MS),
      longestGapHours: round1(longestGapMs / HOUR_MS),
      pasteShare:
        saveOrPasteSignals === 0 ? 0 : Math.round((totalPastes / saveOrPasteSignals) * 100),
    },
  };
}
