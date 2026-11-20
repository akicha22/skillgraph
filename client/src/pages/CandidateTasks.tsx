import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Lightbulb,
  ListChecks,
  Save,
  Send,
  Trophy,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  listCandidateTasks,
  saveCandidateTaskNote,
  submitCandidateTaskAnswer,
} from "../services/assessments";
import type {
  CandidateTasksResponse,
  DailyTask,
  DailyTaskFeedback,
} from "../types/assessments";

const DIFFICULTY_LABELS = { BEGINNER: "Easy", INTERMEDIATE: "Intermediate", ADVANCED: "Challenging" };

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const DIFFICULTY_STYLES: Record<DailyTask["difficulty"], string> = {
  BEGINNER: "bg-emerald-50 text-emerald-700",
  INTERMEDIATE: "bg-amber-50 text-amber-800",
  ADVANCED: "bg-rose-50 text-rose-700",
};

/** Daily practice: ten drills that climb in difficulty, graded on the server. */
export default function CandidateTasks() {
  const [data, setData] = useState<CandidateTasksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, DailyTaskFeedback>>({});
  const [position, setPosition] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  // Bumped after a change so the loader below re-reads the streak and points totals.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCandidateTasks()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        // Keep anything the candidate has typed but not saved across a refetch.
        setNotes((prev) =>
          Object.fromEntries(loaded.tasks.map((task) => [task.id, prev[task.id] ?? task.reflection])),
        );
        setSavedNotes(Object.fromEntries(loaded.tasks.map((task) => [task.id, task.reflection])));
        setAnswers((prev) =>
          Object.fromEntries(loaded.tasks.map((task) => [task.id, prev[task.id] ?? task.answer])),
        );
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load today's tasks.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function submit(taskId: string) {
    const answer = (answers[taskId] ?? "").trim();
    if (!answer) {
      setError("Write an answer before submitting.");
      return;
    }

    setBusyId(taskId);
    setError(null);
    setNotice(null);
    try {
      const result = await submitCandidateTaskAnswer(taskId, answer);
      setFeedback((prev) => ({ ...prev, [taskId]: result.feedback }));
      setAnswers((prev) => ({ ...prev, [taskId]: result.task.answer }));
      setData((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((task) => (task.id === taskId ? result.task : task)),
              summary: {
                ...prev.summary,
                todayDone: prev.tasks.filter((task) =>
                  (task.id === taskId ? result.task.status : task.status) === "DONE",
                ).length,
                todayPoints:
                  prev.summary.todayPoints -
                  (prev.tasks.find((task) => task.id === taskId)?.earnedPoints ?? 0) +
                  result.task.earnedPoints,
                totalPoints:
                  prev.summary.totalPoints -
                  (prev.tasks.find((task) => task.id === taskId)?.earnedPoints ?? 0) +
                  result.task.earnedPoints,
                tasksSolved:
                  prev.summary.tasksSolved +
                  (result.task.solved &&
                  !prev.tasks.find((task) => task.id === taskId)?.solved
                    ? 1
                    : 0),
              },
            }
          : prev,
      );
      setReloadToken((token) => token + 1);
      setNotice(
        result.task.selfReview
          ? "Output saved. Compare your work with the review criteria below."
          : result.feedback.correct
          ? result.feedback.alreadySolved
            ? "That task is already solved — no additional points."
            : `Correct! +${result.feedback.awarded} points.`
          : "Not correct yet. Review the brief and try again; a correct retry earns half points.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit that answer.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(taskId: string) {
    setSavingNoteId(taskId);
    setError(null);
    try {
      await saveCandidateTaskNote(taskId, notes[taskId] ?? "");
      setSavedNotes((prev) => ({ ...prev, [taskId]: notes[taskId] ?? "" }));
      setNotice("Note saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that note.");
    } finally {
      setSavingNoteId(null);
    }
  }

  function feedbackFor(task: DailyTask): DailyTaskFeedback | null {
    if (feedback[task.id]) return feedback[task.id];
    if (task.attempts === 0) return null;
    return {
      correct: task.solved,
      awarded: task.earnedPoints,
      attempts: task.attempts,
      explanation: task.explanation ?? "",
      expectedAnswer: task.expectedAnswer,
      alreadySolved: false,
    };
  }

  const activeTask = data?.tasks.find((task) => task.position === position)
    ?? data?.tasks.find((task) => task.status !== "DONE") ?? data?.tasks[0];
  const activeIndex = activeTask ? (data?.tasks.indexOf(activeTask) ?? -1) : -1;

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
              Practise ten workplace challenges, from quick warm-ups to tougher decisions.
              Checkable answers earn points; practical outputs unlock criteria for reviewing your own work.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/candidate/leaderboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Trophy className="h-4 w-4" aria-hidden />
              Leaderboard
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
              {data.summary.todayDone} of {data.summary.todayTotal} solved today
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              {data.summary.totalPoints} points total
              {data.summary.todayPoints > 0 ? ` · +${data.summary.todayPoints} today` : ""}
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
      ) : data.needsSkills || data.needsSupportedSkills ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ListChecks className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
          <h2 className="mt-2 text-lg font-semibold text-slate-900">{data.needsSupportedSkills ? "No daily bank for your selected skills yet" : "Choose your skills first"}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Daily practice is available for Sales, Client Communication, Leadership, Graphic Design,
            Video Editing, UI/UX Design, Excel, and SQL. Choose a relevant skill to get started.
          </p>
          <Link
            to="/candidate/skills"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Choose skills
          </Link>
        </section>
      ) : activeTask ? (
        <section className="space-y-4" aria-label="Daily challenges">
          <nav className="flex items-center justify-between gap-3" aria-label="Challenge navigation">
            <button type="button" disabled={activeIndex <= 0 || busyId !== null}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              onClick={() => setPosition(data.tasks[activeIndex - 1].position)}>Previous</button>
            <span className="text-sm font-medium text-slate-700" aria-live="polite">
              Q{activeTask.position + 1} of {data.tasks.length}
            </span>
            <button type="button" disabled={activeIndex >= data.tasks.length - 1 || busyId !== null}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              onClick={() => setPosition(data.tasks[activeIndex + 1].position)}>Next</button>
          </nav>
          {((task: DailyTask) => {
            const solved = task.solved;
            const result = feedbackFor(task);
            const noteChanged = (notes[task.id] ?? "") !== (savedNotes[task.id] ?? "");

            return (
              <article
                key={task.id}
                className={`rounded-2xl border bg-white p-6 ${
                  solved ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      {task.position + 1}. {task.skillName}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{task.title}</h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    about {task.estimateMinutes} min
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${DIFFICULTY_STYLES[task.difficulty]}`}
                  >
                    {DIFFICULTY_LABELS[task.difficulty]}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
                    <Trophy className="h-3.5 w-3.5" aria-hidden />
                    {task.selfReview ? "Self-review · no points" : `${task.points} pts`}
                    {solved ? ` · earned ${task.earnedPoints}` : ""}
                  </span>
                </div>

                {task.steps.length === 0 && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{task.scenario}</p>
                )}

                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                    Your challenge
                  </p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
                    {task.question}
                  </p>

                  {task.selfReview && task.status === "DONE" ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">Your output: {task.answer}</p>
                  ) : solved ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                      Solved with “{task.answer}” — {task.earnedPoints} of {task.points} points.
                    </p>
                  ) : (
                    <form
                      className="mt-3 flex flex-col gap-2 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setPosition(task.position);
                        void submit(task.id);
                      }}
                    >
                      <label htmlFor={`answer-${task.id}`} className="sr-only">
                        Your answer
                      </label>
                      <textarea
                        rows={task.selfReview ? 4 : 1}
                        id={`answer-${task.id}`}
                        value={answers[task.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((prev) => ({ ...prev, [task.id]: event.target.value }))
                        }
                        placeholder={task.selfReview ? "A short answer is enough. Use details from the brief." : "Type your answer"}
                        maxLength={500}
                        autoComplete="off"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busyId === task.id || !(answers[task.id] ?? "").trim()}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        {busyId === task.id ? "Submitting…" : task.selfReview ? "Save and see criteria" : "Submit answer"}
                      </button>
                    </form>
                  )}

                  {task.selfReview && result ? (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3 text-sm text-slate-800">
                      <p className="font-semibold">Review criteria</p>
                      <p className="mt-1">{result.explanation}</p>
                      <p className="mt-2 text-slate-600">Compare these criteria with your output. This submission is not graded.</p>
                    </div>
                  ) : result && (
                    <div
                      className={`mt-3 rounded-lg border p-3 text-sm ${
                        result.correct
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 font-medium">
                        {result.correct ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <XCircle className="h-4 w-4" aria-hidden />
                        )}
                        {result.correct
                          ? result.alreadySolved
                            ? "Correct — already solved, no extra points."
                            : `Correct — +${result.awarded} points.`
                          : `Not correct yet. Attempt${result.attempts === 1 ? "" : "s"}: ${result.attempts}. A correct retry earns half points.`}
                      </p>
                      {result.explanation && <p className="mt-1.5">{result.explanation}</p>}
                      {result.expectedAnswer && (
                        <p className="mt-1.5">
                          Expected answer: <strong>{result.expectedAnswer}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-sm">
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
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void saveNote(task.id)}
                      disabled={!noteChanged || savingNoteId === task.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" aria-hidden />
                      {savingNoteId === task.id ? "Saving…" : "Save note"}
                    </button>
                    {solved && task.completedAt && (
                      <span className="text-xs text-slate-500">
                        Solved at{" "}
                        {new Date(task.completedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    <Link
                      to="/candidate/leaderboard"
                      className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      See the rankings →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })(activeTask)}
        </section>
      ) : null}
    </DashboardLayout>
  );
}
