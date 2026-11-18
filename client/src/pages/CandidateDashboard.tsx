import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PermissionCheck from "../components/PermissionCheck";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import { listCandidateAssessments } from "../services/assessments";
import type { CandidateAssessmentSummary } from "../types/assessments";

export default function CandidateDashboard() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<CandidateAssessmentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCandidateAssessments()
      .then((loaded) => {
        if (!cancelled) setAssessments(loaded.assessments);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load assessments.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-slate-600">
          Open a published assessment below, or make sure your skills are up to date.
        </p>
        <Link
          to="/candidate/skills"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Choose your skills
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Published assessments</h2>
        {error ? (
          <p className="mt-2 text-sm text-rose-700">{error}</p>
        ) : assessments === null ? (
          <p className="mt-2 text-sm text-slate-600">Loading assessments…</p>
        ) : assessments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No assessments have been published yet. They will appear here once a recruiter publishes
            one.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {assessments.map((assessment) => (
              <li key={assessment.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {assessment.companyName} · {assessment.jobTitle}
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">{assessment.title}</h3>
                <p className="mt-1 text-xs text-slate-600">
                  {assessment.taskCount} tasks · {assessment.durationMinutes} min
                </p>
                <Link
                  to={`/candidate/assessments/${assessment.id}`}
                  className="mt-3 inline-block rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Open assessment
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PermissionCheck />
    </DashboardLayout>
  );
}