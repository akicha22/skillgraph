import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock, FileText, Table2 } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import DataPreview from "../components/DataPreview";
import { getCandidateAssessment } from "../services/assessments";
import { ApiError } from "../services/api";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  TASK_TYPE_LABELS,
  type CandidateAssessmentDetail,
} from "../types/assessments";

export default function CandidateAssessmentPage() {
  const { versionId = "" } = useParams();
  const [assessment, setAssessment] = useState<CandidateAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          </article>
        ))}
      </section>
    </DashboardLayout>
  );
}
