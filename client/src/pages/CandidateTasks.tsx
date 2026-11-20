import { Button } from "../components/ui/Button";
import { Alert, Badge, Card } from "../components/ui/Card";
import { Textarea } from "../components/ui/Field";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Flame,
  Lightbulb,
  ListChecks,
  Save,
  Send,
  Trophy,
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
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">Daily tasks</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Practise ten workplace challenges, from quick warm-ups to tougher decisions.
              Checkable answers earn points; practical outputs unlock criteria for reviewing your own work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/candidate/leaderboard"
              className={buttonClasses({ variant: "secondary" })}
            >
              <Trophy className="h-4 w-4" aria-hidden />
              Leaderboard
            </Link>
            <Link
              to="/candidate"
              className={buttonClasses()}
            >
              Assessments
            </Link>
          </div>
        </div>

        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="accent" className="items-center gap-1.5 tabular-nums">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {data.summary.streakDays} day streak
            </Badge>
            <Badge tone="success" className="items-center gap-1.5 tabular-nums">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {data.summary.todayDone} of {data.summary.todayTotal} solved today
            </Badge>
            <Badge tone="accent" className="items-center gap-1.5 tabular-nums">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              {data.summary.totalPoints} points total
              {data.summary.todayPoints > 0 ? ` · +${data.summary.todayPoints} today` : ""}
            </Badge>
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
                      ? "bg-slate-100 text-slate-600"
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
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info" role="status">{notice}</Alert>}

      {data === null ? (
        !error && <Card role="status" className="space-y-3"><span className="sr-only">Building today's practice set…</span><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /></Card>
      ) : data.needsSkills || data.needsSupportedSkills ? (
        <Card><EmptyState
          icon={<ListChecks className="size-5" />}
          title={data.needsSupportedSkills ? "No daily bank for your selected skills yet" : "Choose your skills first"}
          text="Daily practice is available for Sales, Client Communication, Leadership, Graphic Design, Video Editing, UI/UX Design, Excel, SQL, and Civil Engineering. Choose a relevant skill to get started."
          action={<Link to="/candidate/skills" className={buttonClasses()}>Choose skills</Link>}
        /></Card>
      ) : activeTask ? (
        <section className="mx-auto max-w-[65ch] space-y-4" aria-label="Daily challenges">
          <nav className="flex items-center justify-between gap-3" aria-label="Challenge navigation">
            <Button variant="secondary" size="sm" disabled={activeIndex <= 0 || busyId !== null}
              onClick={() => setPosition(data.tasks[activeIndex - 1].position)}>Previous</Button>
            <span className="text-sm font-medium text-slate-700" aria-live="polite">
              Q{activeIndex + 1} of {data.tasks.length}
            </span>
            <Button variant="secondary" size="sm" disabled={activeIndex >= data.tasks.length - 1 || busyId !== null}
              onClick={() => setPosition(data.tasks[activeIndex + 1].position)}>Next</Button>
          </nav>
          {((task: DailyTask) => {
            const solved = task.solved;
            const result = feedbackFor(task);
            const noteChanged = (notes[task.id] ?? "") !== (savedNotes[task.id] ?? "");

            return (
              <Card key={task.id} className={solved ? "border-emerald-200" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
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
                  <Badge tone={task.selfReview ? "neutral" : "accent"} className="items-center gap-1 tabular-nums">
                    <Trophy className="h-3.5 w-3.5" aria-hidden />
                    {task.selfReview ? "Self-review · no points" : `${task.points} pts`}
                    {solved ? ` · earned ${task.earnedPoints}` : ""}
                  </Badge>
                </div>

                {task.steps.length === 0 && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{task.scenario}</p>
                )}

                <div className="mt-4 rounded-control bg-brand-50 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                    Your challenge
                  </p>
                  <p className="mt-2 text-base font-medium leading-relaxed text-slate-900">
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
                      className="mt-3 flex flex-col gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setPosition(task.position);
                        void submit(task.id);
                      }}
                    >
                      <label htmlFor={`answer-${task.id}`} className="sr-only">
                        Your answer
                      </label>
                      <Textarea
                        rows={task.selfReview ? 4 : 1}
                        id={`answer-${task.id}`}
                        value={answers[task.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((prev) => ({ ...prev, [task.id]: event.target.value }))
                        }
                        placeholder={task.selfReview ? "A short answer is enough. Use details from the brief." : "Type your answer"}
                        maxLength={500}
                        autoComplete="off"

                      />
                      <Button
                        type="submit" loading={busyId === task.id} leadingIcon={<Send className="size-4" />}
                        disabled={busyId === task.id || !(answers[task.id] ?? "").trim()}
                        className="self-start"
                      >
                        {busyId === task.id ? "Submitting…" : task.selfReview ? "Save and see criteria" : "Submit answer"}
                      </Button>
                    </form>
                  )}

                  {task.selfReview && result ? (
                    <Alert tone="info" heading="Review criteria" className="mt-3" role="status">
                      <p className="mt-1">{result.explanation}</p>
                      <p className="mt-2">Compare these criteria with your output. This submission is not graded.</p>
                    </Alert>
                  ) : result && (
                    <Alert tone={result.correct ? "success" : "error"} role={result.correct ? "status" : undefined} className="mt-3" heading={result.correct
                      ? result.alreadySolved ? "Correct — already solved, no extra points." : `Correct — +${result.awarded} points.`
                      : `Not correct yet. Attempt${result.attempts === 1 ? "" : "s"}: ${result.attempts}. A correct retry earns half points.`}>
                      {result.explanation && <p className="mt-1.5">{result.explanation}</p>}
                      {result.expectedAnswer && (
                        <p className="mt-1.5">
                          Expected answer: <strong>{result.expectedAnswer}</strong>
                        </p>
                      )}
                    </Alert>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      One line on what you learned (optional)
                    </span>
                    <Textarea
                      rows={2}
                      value={notes[task.id] ?? ""}
                      onChange={(event) =>
                        setNotes((prev) => ({ ...prev, [task.id]: event.target.value }))
                      }
                      placeholder="What would you do differently next time?"
                      className="mt-1"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary" size="sm" loading={savingNoteId === task.id} leadingIcon={<Save className="size-4" /> }
                      onClick={() => void saveNote(task.id)}
                      disabled={!noteChanged || savingNoteId === task.id}
                    >
                      {savingNoteId === task.id ? "Saving…" : "Save note"}
                    </Button>
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
              </Card>
            );
          })(activeTask)}
        </section>
      ) : null}
    </DashboardLayout>
  );
}
