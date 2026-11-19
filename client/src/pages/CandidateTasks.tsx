import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, Clock, Flame, ListChecks } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { completeCandidateTask, listCandidateTasks } from "../services/assessments";
import type { CandidateTasksResponse } from "../types/assessments";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Daily practice: unmarked drills drawn from the candidate's own skills. */
export default function CandidateTasks() {
  const [data, setData] = useState<CandidateTasksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    return listCandidateTasks()
      .then((loaded) => {
        setData(loaded);
        setNotes(Object.fromEntries(loaded.tasks.map((task) => [task.id, task.reflection])));
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load today's tasks.");
      });
  }

  useEffect(() => {
    let cancelled = false;
    listCandidateTasks()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setNotes(Object.fromEntries(loaded.tasks.map((task) => [task.id, task.reflection])));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load today's tasks.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(taskId: string, done: boolean) {
    setBusyId(taskId);
    setNotice(null);
    try {
      await completeCandidateTask(taskId, done, notes[taskId] ?? "");
      // Re-read so the streak and the seven-day strip reflect the change immediately.
      await load();
      setNotice(done ? "Marked done. Small, regular practice is what moves the needle." : "Reopened.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that task.");
    } finally {
      setBusyId(null);
    }
  }

  const todayLabel = data
    ? new Date(`${data.day}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Daily tasks</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Short practice drills chosen from your skills. Nothing here is marked, nobody reviews
              it, and it is not an assessment — it is how you get ready for one.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/candidate/posts"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Opportunities
            </Link>
            <Link
              to="/candidate"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Assessments
            </Link>
          </div>
        </div>

        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {data.summary.streakDays} day streak
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {data.summary.todayDone} of {data.summary.todayTotal} done today
            </span>
            {todayLabel && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                {todayLabel}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5" aria-label="Last seven days">
              {data.summary.last7.map((day, index) => (
                <span
                  key={day.day}
                  title={`${day.day}: ${day.done} of ${day.total} done`}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
                    day.total === 0
                      ? "bg-slate-100 text-slate-400"
                      : day.done === day.total
                        ? "bg-emerald-500 text-white"
                        : day.done > 0
                          ? "bg-emerald-200 text-emerald-900"
                          : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {DAY_LABELS[new Date(`${day.day}T00:00:00`).getDay()] ?? index}
                </span>
              ))}
            </span>
          </div>
        )}
      </section>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {data === null ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Building today's practice set…
        </p>
      ) : data.needsSkills ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ListChecks className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Choose your skills first</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Practice tasks are built from the skills on your profile. Pick a few and today's set will
            appear here.
          </p>
          <Link
            to="/candidate/skills"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Choose skills
          </Link>
        </section>
      ) : (
        <ul className="space-y-4">
          {data.tasks.map((task) => {
            const done = task.status === "DONE";
            return (
              <li
                key={task.id}
                className={`rounded-2xl border bg-white p-6 ${
                  done ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      {task.skillName}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{task.title}</h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    about {task.estimateMinutes} min
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {task.scenario}
                </p>

                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Work through these
                  </p>
                  <ol className="mt-2 space-y-1.5 text-sm text-slate-700">
                    {task.steps.map((step, index) => (
                      <li key={step} className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <label className="mt-4 block text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    One line on what you learned (optional)
                  </span>
                  <textarea
                    rows={2}
                    value={notes[task.id] ?? ""}
                    onChange={(event) =>
                      setNotes((prev) => ({ ...prev, [task.id]: event.target.value }))
                    }
                    placeholder="What would you do differently next time?"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </label>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {done ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Done
                        {task.completedAt
                          ? ` · ${new Date(task.completedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggle(task.id, false)}
                        disabled={busyId === task.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Circle className="h-4 w-4" aria-hidden />
                        Reopen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void toggle(task.id, true)}
                      disabled={busyId === task.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      {busyId === task.id ? "Saving…" : "Mark done"}
                    </button>
                  )}
                  <Link
                    to="/candidate/skills"
                    className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Practise something else →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardLayout>
  );
}
