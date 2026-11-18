import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import PermissionCheck from "../components/PermissionCheck";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import { listAssessments } from "../services/assessments";
import type { AssessmentSummary } from "../types/assessments";

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAssessments()
      .then((list) => {
        if (!cancelled) setAssessments(list.assessments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your assessments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
          Describe a role and SkillGraph builds a draft assessment with tasks, marks and rubrics you can review.
        </p>
        <Link
          to="/recruiter/assessments/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create assessment
        </Link>
      </section>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Your assessments</h2>
          {!loading && !error && (
            <span className="text-sm text-slate-500">
              {assessments.length} {assessments.length === 1 ? "assessment" : "assessments"}
            </span>
          )}
        </div>

        {loading && <p className="mt-3 text-sm text-slate-600">Loading assessments…</p>}

        {!loading && error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        {!loading && !error && assessments.length === 0 && (
          <p className="mt-3 text-sm text-slate-600">
            No assessments yet. Describe a role above and SkillGraph will draft the first one.
          </p>
        )}

        {!loading && !error && assessments.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {assessments.map((assessment) => {
              const latest = assessment.latestVersion;
              return (
                <li key={assessment.id}>
                  <Link
                    to={`/recruiter/assessments/${assessment.id}/versions/${latest.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{latest.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {assessment.companyName} · {assessment.jobTitle} · v{latest.versionNumber} of{" "}
                        {assessment.versionCount} · {latest.taskCount} tasks · {latest.durationMinutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          latest.status === "PUBLISHED"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {latest.status === "PUBLISHED" ? "Published" : "Draft"}
                      </span>
                      <span className="hidden text-xs text-slate-500 sm:inline">
                        {new Date(latest.updatedAt).toLocaleDateString()}
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <PermissionCheck />
    </DashboardLayout>
  );
}