import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getSubmission, saveSubmissionScores } from "../services/assessments";
import { ApiError } from "../services/api";
import { TASK_TYPE_LABELS, type SubmissionDetail } from "../types/assessments";

/** The score boxes start from what is already saved; empty means "not scored yet". */
function scoreInputsFrom(submission: SubmissionDetail) {
  return Object.fromEntries(
    submission.tasks.flatMap((task) =>
      task.rubric.map((criterion) => [criterion.id, criterion.score === null ? "" : String(criterion.score)]),
    ),
  ) as Record<string, string>;
}

export default function RecruiterSubmission() {
  const { attemptId = "" } = useParams();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [savingScores, setSavingScores] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoresSaved, setScoresSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSubmission(attemptId)
      .then((loaded) => {
        if (cancelled) return;
        setSubmission(loaded);
        setScoreInputs(scoreInputsFrom(loaded));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("This submission is not available. It may belong to another recruiter, or it was not submitted.");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load this submission.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading submission…
        </p>
      </DashboardLayout>
    );
  }

  if (error || !submission) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error ?? "Submission not found."}</span>
          </p>
          <Link
            to="/recruiter"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-rose-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const totalMarks = submission.tasks.reduce((sum, task) => sum + task.marks, 0);
  const answered = submission.tasks.filter((task) => task.answer !== null).length;

  const savedScoreByCriterion = new Map(
    submission.tasks.flatMap((task) =>
      task.rubric.map((criterion) => [criterion.id, criterion.score] as const),
    ),
  );
  const pendingScores = submission.tasks.flatMap((task) =>
    task.rubric.map((criterion) => {
      const raw = (scoreInputs[criterion.id] ?? "").trim();
      const value = raw === "" ? null : Number(raw);
      return { criterion, value: value !== null && Number.isFinite(value) ? value : null };
    }),
  );
  const pendingAwarded = pendingScores.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  const pendingScored = pendingScores.filter((entry) => entry.value !== null).length;
  const unsavedScores = pendingScores.some(
    (entry) => entry.value !== (savedScoreByCriterion.get(entry.criterion.id) ?? null),
  );

  function taskAwarded(task: SubmissionDetail["tasks"][number]) {
    return task.rubric.reduce((sum, criterion) => {
      const raw = (scoreInputs[criterion.id] ?? "").trim();
      const value = raw === "" ? 0 : Number(raw);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  async function saveScores() {
    if (!submission) return;
    const scores: { criterionId: string; marks: number }[] = [];
    for (const { criterion, value } of pendingScores) {
      if (value === null) continue;
      if (!Number.isInteger(value) || value < 0 || value > criterion.maxMarks) {
        setScoreError(`"${criterion.name}" must be a whole number from 0 to ${criterion.maxMarks}.`);
        return;
      }
      scores.push({ criterionId: criterion.id, marks: value });
    }

    setSavingScores(true);
    setScoreError(null);
    setScoresSaved(false);
    try {
      const updated = await saveSubmissionScores(submission.id, scores);
      setSubmission(updated);
      setScoreInputs(scoreInputsFrom(updated));
      setScoresSaved(true);
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Could not save these scores.");
    } finally {
      setSavingScores(false);
    }
  }

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {submission.assessment.companyName} · {submission.assessment.jobTitle}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{submission.candidate.name}</h1>
        <p className="text-sm text-slate-600">{submission.candidate.email}</p>
        <p className="mt-2 text-sm text-slate-600">{submission.assessment.title}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {answered} of {submission.tasks.length} tasks answered
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{totalMarks} marks</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {submission.assessment.durationMinutes} min
          </span>
          {submission.submittedAt && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
              Submitted {new Date(submission.submittedAt).toLocaleString()}
            </span>
          )}
        </div>
        <Link
          to={`/recruiter/assessments/${submission.assessment.assessmentId}/versions/${submission.assessment.versionId}`}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to this version
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total score</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {pendingAwarded}
              <span className="ml-1 text-base font-medium text-slate-500">
                / {submission.score.possible}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {pendingScored} of {submission.score.criterionCount} criteria scored
              {submission.score.reviewedAt
                ? ` · last saved ${new Date(submission.score.reviewedAt).toLocaleString()}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unsavedScores && <span className="text-xs text-amber-700">Unsaved scores</span>}
            {scoresSaved && !unsavedScores && (
              <span className="text-xs text-emerald-700">Scores saved</span>
            )}
            <button
              onClick={() => void saveScores()}
              disabled={savingScores}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingScores ? "Saving…" : "Save scores"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Leave a box empty while you are still reading; only saved marks count towards the total.
        </p>
        {scoreError && <p className="mt-2 text-sm text-rose-700">{scoreError}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Answers and marks</h2>
        {submission.tasks.map((task) => (
          <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-6">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                {task.position + 1}. {task.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                  {TASK_TYPE_LABELS[task.type] ?? task.type}
                </span>
                <span>{task.skillName}</span>
                <span>·</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  {taskAwarded(task)} / {task.marks}
                </span>
              </div>
            </header>

            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{task.prompt}</p>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Candidate&apos;s answer
              </h4>
              {task.answer ? (
                <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
                  {task.answer}
                </p>
              ) : (
                <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  No answer was saved for this task.
                </p>
              )}
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Criteria and marks
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
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {task.rubric.map((criterion) => {
                    const raw = (scoreInputs[criterion.id] ?? "").trim();
                    const value = raw === "" ? null : Number(raw);
                    const invalid =
                      value !== null &&
                      (!Number.isInteger(value) || value < 0 || value > criterion.maxMarks);
                    return (
                      <tr key={criterion.id}>
                        <td className="py-2 pr-3 font-medium text-slate-800">{criterion.name}</td>
                        <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                        <td className="py-2 pl-3">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              max={criterion.maxMarks}
                              inputMode="numeric"
                              aria-label={`Marks for ${criterion.name}`}
                              value={scoreInputs[criterion.id] ?? ""}
                              onChange={(event) => {
                                setScoresSaved(false);
                                setScoreError(null);
                                setScoreInputs((prev) => ({
                                  ...prev,
                                  [criterion.id]: event.target.value,
                                }));
                              }}
                              className={`w-16 rounded-lg border px-2 py-1 text-right text-sm text-slate-800 focus:outline-none ${
                                invalid
                                  ? "border-rose-400 focus:border-rose-500"
                                  : "border-slate-300 focus:border-indigo-500"
                              }`}
                            />
                            <span className="text-xs text-slate-500">/ {criterion.maxMarks}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </DashboardLayout>
  );
}
