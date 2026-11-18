import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock, FileText, Table2 } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import DataPreview from "../components/DataPreview";
import {
  getCandidateAssessment,
  saveCandidateAnswer,
  startCandidateAttempt,
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCandidateAssessment(versionId)
      .then((loaded) => {
        if (!cancelled) setAssessment(loaded);
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

  async function startAttempt() {
    setStarting(true);
    setAttemptError(null);
    try {
      const started = await startCandidateAttempt(versionId);
      setAttempt(started);
      setDrafts(Object.fromEntries(started.responses.map((row) => [row.taskId, row.answer])));
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not start this assessment.");
    } finally {
      setStarting(false);
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

  const totalMarks = assessment.tasks.reduce((sum, task) => sum + task.marks, 0);

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {assessment.assessment.companyName} · {assessment.assessment.jobTitle}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{assessment.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{assessment.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {assessment.tasks.length} tasks
          </span>
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

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
        {attempt ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">
              {attempt.status === "IN_PROGRESS" ? "Answering in progress" : "Attempt submitted"}
            </h2>
            <p className="mt-1 text-sm text-indigo-900">
              {attempt.status === "IN_PROGRESS"
                ? "Write each answer, then save it. Saved answers stay here if you come back later; nothing is submitted yet."
                : "Your answers are saved and this attempt can no longer be changed."}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-900">Ready to start?</h2>
            <p className="mt-1 text-sm text-indigo-900">
              Starting opens an answer box under each task and keeps your saved answers for later.
            </p>
            <button
              onClick={() => void startAttempt()}
              disabled={starting}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start answering"}
            </button>
          </>
        )}
        {attemptError && <p className="mt-2 text-sm text-rose-700">{attemptError}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Before you start</h2>
        <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{assessment.jobContext}</p>
        <h3 className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Instructions
        </h3>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{assessment.candidateInstructions}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
        {assessment.tasks.map((task) => (
          <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-6">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-900">
                {task.position + 1}. {task.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                  {TASK_TYPE_LABELS[task.type] ?? task.type}
                </span>
                <span>{task.skillName}</span>
                <span>·</span>
                <span>{task.marks} marks</span>
                <span>·</span>
                <span>{task.timeMinutes} min</span>
              </div>
            </header>

            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{task.prompt}</p>

            {Object.keys(task.publicData).length > 0 && (
              <div className="mt-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Table2 className="h-3.5 w-3.5" aria-hidden />
                  Data for this task
                </h4>
                <div className="mt-2">
                  <DataPreview data={task.publicData} />
                </div>
              </div>
            )}

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                How this task is scored
              </h4>
              <table className="mt-2 w-full text-left text-sm">
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
                  {task.rubric.map((criterion) => (
                    <tr key={criterion.position}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{criterion.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                      <td className="py-2 text-right text-slate-700">{criterion.maxMarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {attempt && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <label
                  htmlFor={`answer-${task.id}`}
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Your answer
                </label>
                {task.type === "FILE_SUBMISSION" ? (
                  <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    File upload answers are not available yet.
                  </p>
                ) : (
                  <>
                    <textarea
                      id={`answer-${task.id}`}
                      rows={5}
                      value={drafts[task.id] ?? ""}
                      readOnly={attempt.status !== "IN_PROGRESS"}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [task.id]: event.target.value }))
                      }
                      placeholder="Type your answer here"
                      className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    {attempt.status === "IN_PROGRESS" && (
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => void saveAnswer(task.id)}
                          disabled={savingTaskId === task.id}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {savingTaskId === task.id ? "Saving…" : "Save answer"}
                        </button>
                        {savedTaskId === task.id && (
                          <span className="text-xs text-emerald-700">Saved</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </section>
    </DashboardLayout>
  );
}
