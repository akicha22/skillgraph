import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { getSubmission } from "../services/assessments";
import { ApiError } from "../services/api";
import { TASK_TYPE_LABELS, type SubmissionDetail } from "../types/assessments";

export default function RecruiterSubmission() {
  const { attemptId = "" } = useParams();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSubmission(attemptId)
      .then((loaded) => {
        if (!cancelled) setSubmission(loaded);
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

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {submission.assessment.companyName} · {submission.assessment.jobTitle}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{submission.candidate.name}</h1>
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

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Answers</h2>
        {submission.tasks.map((task) => (
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
                Criteria
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
                    <tr key={criterion.name}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{criterion.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                      <td className="py-2 text-right text-slate-700">{criterion.maxMarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </DashboardLayout>
  );
}
