import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  FileText,
  Table2,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import DataPreview from "../components/DataPreview";
import {
  getCandidateAssessment,
  getCandidateAttempt,
  saveCandidateAnswer,
  startCandidateAttempt,
  submitCandidateAttempt,
} from "../services/assessments";
import { ApiError } from "../services/api";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  TASK_TYPE_LABELS,
  type CandidateAssessmentDetail,
  type CandidateAttempt,
} from "../types/assessments";

export default function CandidateAssessmentPage() {
  const { versionId = "" } = useParams();
  const [assessment, setAssessment] = useState<CandidateAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<CandidateAttempt | null>(null);
  // Which version the loaded attempt belongs to, so a switch never shows another one's answers.
  const [attemptVersionId, setAttemptVersionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [reloadingQuestions, setReloadingQuestions] = useState(false);
  // One task is shown at a time; the strip above the slide switches between them.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCandidateAssessment(versionId)
      .then((loaded) => {
        if (cancelled) return;
        setAssessment(loaded);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("This assessment is not available. It may not be published yet, or the link is wrong.");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load this assessment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  // Opens in the attempt's real state instead of pretending nothing was started yet.
  useEffect(() => {
    let cancelled = false;
    getCandidateAttempt(versionId)
      .then(({ attempt: existing }) => {
        if (cancelled) return;
        setAttempt(existing);
        setDrafts(
          existing
            ? Object.fromEntries(existing.responses.map((row) => [row.taskId, row.answer]))
            : {},
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setAttemptError(err instanceof Error ? err.message : "Could not load your saved answers.");
      })
      .finally(() => {
        if (!cancelled) setAttemptVersionId(versionId);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  async function startAttempt() {
    setStarting(true);
    setAttemptError(null);
    try {
      const started = await startCandidateAttempt(versionId);
      setAttempt(started);
      setDrafts(Object.fromEntries(started.responses.map((row) => [row.taskId, row.answer])));
      setActiveIndex(0);
      // The questions are only sent once an attempt exists, so the page re-reads them now.
      setAssessment(await getCandidateAssessment(versionId));
    } catch (err) {
      setAttemptError(
        err instanceof Error
          ? err.message
          : "Could not start this assessment. Reload the page and try again.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function reloadQuestions() {
    setReloadingQuestions(true);
    setAttemptError(null);
    try {
      setAssessment(await getCandidateAssessment(versionId));
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not load the questions.");
    } finally {
      setReloadingQuestions(false);
    }
  }

  async function submitAttempt() {
    if (!attempt) return;
    setSubmitting(true);
    setAttemptError(null);
    try {
      setAttempt(await submitCandidateAttempt(attempt.id));
      setConfirmingSubmit(false);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not submit this attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAnswer(taskId: string) {
    if (!attempt) return;
    setSavingTaskId(taskId);
    setSavedTaskId(null);
    setAttemptError(null);
    try {
      const saved = await saveCandidateAnswer(attempt.id, taskId, drafts[taskId] ?? "");
      setAttempt(
        (prev) =>
          prev && {
            ...prev,
            responses: [...prev.responses.filter((row) => row.taskId !== taskId), saved],
          },
      );
      setSavedTaskId(taskId);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not save that answer.");
    } finally {
      setSavingTaskId(null);
    }
  }

  const activeAttempt = attemptVersionId === versionId ? attempt : null;
  const attemptLoading = attemptVersionId !== versionId;

  if (loading) {
    return (
      <DashboardLayout>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading assessment…
        </p>
      </DashboardLayout>
    );
  }

  if (error || !assessment) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error ?? "Assessment not found."}</span>
          </p>
          <Link
            to="/candidate"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-rose-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const tasks = assessment.tasks;
  const totalMarks = tasks.reduce((sum, task) => sum + task.marks, 0);
  const safeIndex = tasks.length > 0 ? Math.min(activeIndex, tasks.length - 1) : 0;
  const activeTask = tasks[safeIndex] ?? null;
  const savedTaskIds = new Set(
    (activeAttempt?.responses ?? [])
      .filter((response) => response.answer.trim().length > 0)
      .map((response) => response.taskId),
  );
  const savedCount = savedTaskIds.size;
  const questionsReady = assessment.started;

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {assessment.assessment.companyName} · {assessment.assessment.jobTitle}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{assessment.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{assessment.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{tasks.length} tasks</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{totalMarks} marks</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {assessment.durationMinutes} min
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {LEVEL_LABELS[assessment.targetLevel] ?? assessment.targetLevel} ·{" "}
            {DIFFICULTY_LABELS[assessment.difficulty] ?? assessment.difficulty}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {assessment.aiPolicy === "NOT_ALLOWED" ? "AI not allowed" : "AI allowed if disclosed"}
          </span>
        </div>
      </section>

      {attemptLoading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Checking your attempt…
        </p>
      ) : !activeAttempt ? (
        <>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Ready to start?</h2>
            <p className="mt-1 text-sm text-indigo-900">
              You will see one task at a time and can move between them. Each task has its own answer
              box, and saved answers are kept if you come back later.
            </p>
            <button
              onClick={() => void startAttempt()}
              disabled={starting}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start answering"}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Before you start</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
              {assessment.jobContext}
            </p>
            <h3 className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Instructions
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
              {assessment.candidateInstructions}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">What you will be asked</h2>
            <p className="mt-1 text-sm text-slate-600">
              These are the topics. The tasks themselves open when you start, so you are not reading
              questions before you are ready.
            </p>
            <ol className="mt-4 divide-y divide-slate-100">
              {tasks.map((task, index) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{task.skillName}</p>
                      <p className="text-xs text-slate-500">
                        {TASK_TYPE_LABELS[task.type] ?? task.type}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {task.marks} marks · {task.timeMinutes} min
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : !questionsReady || !activeTask ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Your attempt is started</h2>
          <p className="mt-1 text-sm text-amber-900">
            The tasks could not be loaded just now. Your saved answers are safe — load the tasks to
            carry on.
          </p>
          <button
            onClick={() => void reloadQuestions()}
            disabled={reloadingQuestions}
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            {reloadingQuestions ? "Loading…" : "Load the tasks"}
          </button>
          {attemptError && <p className="mt-2 text-sm text-rose-700">{attemptError}</p>}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {activeAttempt.status === "IN_PROGRESS" ? "Your attempt" : "Attempt submitted"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-indigo-900">
                  {activeAttempt.status === "IN_PROGRESS"
                    ? "Saved answers are kept if you come back later; nothing is submitted until you submit."
                    : `Your answers are saved and this attempt was submitted${
                        activeAttempt.submittedAt
                          ? ` on ${new Date(activeAttempt.submittedAt).toLocaleString()}`
                          : ""
                      }. It can no longer be changed.`}
                </p>
                <p className="mt-1 text-xs font-medium text-indigo-800">
                  {savedCount} of {tasks.length} tasks saved
                </p>
              </div>
              {activeAttempt.status === "IN_PROGRESS" &&
                (confirmingSubmit ? (
                  <div className="rounded-xl border border-indigo-200 bg-white p-3">
                    <p className="text-sm text-slate-700">
                      Submit this attempt? Only saved answers are submitted, and answers cannot be
                      changed afterwards.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => void submitAttempt()}
                        disabled={submitting}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {submitting ? "Submitting…" : "Submit and lock"}
                      </button>
                      <button
                        onClick={() => setConfirmingSubmit(false)}
                        disabled={submitting}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingSubmit(true)}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Submit attempt
                  </button>
                ))}
            </div>
            {attemptError && <p className="mt-2 text-sm text-rose-700">{attemptError}</p>}
          </section>

          <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label="Tasks" className="lg:sticky lg:top-4 lg:self-start">
              <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
                {tasks.map((task, index) => {
                  const isActive = index === safeIndex;
                  return (
                    <li key={task.id} className="shrink-0 lg:shrink">
                      <button
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex w-40 items-center gap-2 rounded-xl border px-3 py-2 text-left lg:w-full ${
                          isActive
                            ? "border-indigo-500 bg-white shadow-sm"
                            : "border-slate-200 bg-white/70 hover:border-slate-300"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isActive
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-slate-900">
                            Task {index + 1}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {task.skillName}
                          </span>
                        </span>
                        {savedTaskIds.has(task.id) && (
                          <span
                            className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                            title="Answer saved"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                Task {safeIndex + 1} of {tasks.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
                {activeTask.title ?? `Task ${safeIndex + 1}`}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                  {TASK_TYPE_LABELS[activeTask.type] ?? activeTask.type}
                </span>
                <span>{activeTask.skillName}</span>
                <span>·</span>
                <span>{activeTask.marks} marks</span>
                <span>·</span>
                <span>{activeTask.timeMinutes} min</span>
              </div>

              <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">
                {activeTask.prompt}
              </p>

              {Object.keys(activeTask.publicData).length > 0 && (
                <div className="mt-5">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Table2 className="h-3.5 w-3.5" aria-hidden />
                    Data for this task
                  </h3>
                  <div className="mt-2">
                    <DataPreview data={activeTask.publicData} />
                  </div>
                </div>
              )}

              {activeTask.rubric.length > 0 && (
                <details className="mt-5 rounded-xl border border-slate-200">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700">
                    How this task is scored
                    <span className="text-xs font-normal text-slate-500">
                      {activeTask.rubric.length} criteria · {activeTask.marks} marks
                    </span>
                  </summary>
                  <div className="border-t border-slate-100 px-4 py-3">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="pb-1">
                            Criterion
                          </th>
                          <th scope="col" className="pb-1">
                            What is checked
                          </th>
                          <th scope="col" className="pb-1 text-right">
                            Marks
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeTask.rubric.map((criterion) => (
                          <tr key={criterion.position}>
                            <td className="py-2 pr-3 font-medium text-slate-800">
                              {criterion.name}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                            <td className="py-2 text-right text-slate-700">
                              {criterion.maxMarks}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <div className="mt-6 border-t border-slate-100 pt-5">
                <label
                  htmlFor={`answer-${activeTask.id}`}
                  className="text-sm font-semibold text-slate-900"
                >
                  Your answer
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeAttempt.status === "IN_PROGRESS"
                    ? "Your text stays here while you switch tasks. Press Save answer to keep it."
                    : "This attempt is submitted, so the answer is read-only."}
                </p>
                {activeTask.type === "FILE_SUBMISSION" ? (
                  <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    File upload answers are not available yet.
                  </p>
                ) : (
                  <>
                    <textarea
                      id={`answer-${activeTask.id}`}
                      rows={12}
                      value={drafts[activeTask.id] ?? ""}
                      readOnly={activeAttempt.status !== "IN_PROGRESS"}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [activeTask.id]: event.target.value }))
                      }
                      placeholder="Type your answer here"
                      className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {activeAttempt.status === "IN_PROGRESS" && (
                        <button
                          onClick={() => void saveAnswer(activeTask.id)}
                          disabled={savingTaskId === activeTask.id}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {savingTaskId === activeTask.id ? "Saving…" : "Save answer"}
                        </button>
                      )}
                      {savedTaskId === activeTask.id && (
                        <span className="text-xs text-emerald-700">Saved</span>
                      )}
                      <span className="ml-auto text-xs text-slate-400">
                        {(drafts[activeTask.id] ?? "").length} characters
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveIndex(Math.max(0, safeIndex - 1))}
                  disabled={safeIndex === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Previous
                </button>
                <span className="text-xs text-slate-500">
                  {safeIndex + 1} / {tasks.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveIndex(Math.min(tasks.length - 1, safeIndex + 1))}
                  disabled={safeIndex >= tasks.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </article>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
