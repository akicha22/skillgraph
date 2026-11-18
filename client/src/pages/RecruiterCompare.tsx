import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Scale } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { compareSubmissions } from "../services/assessments";
import { ApiError } from "../services/api";
import type { ComparisonCandidate, ComparisonDetail } from "../types/assessments";

const DEFAULT_WEIGHT = 10;

/** Default weights sit flat, so a recruiter has to make a deliberate choice to bias the result. */
function defaultWeights(skills: ComparisonDetail["skills"]) {
  return Object.fromEntries(skills.map((skill) => [skill.skillId, DEFAULT_WEIGHT]));
}

/**
 * The weighted score is a percentage over the skills this candidate actually has marks for.
 * A skill with no marks is missing evidence and is left out, never counted as zero.
 */
function compositePercent(
  candidate: ComparisonCandidate,
  skills: ComparisonDetail["skills"],
  weights: Record<string, number>,
) {
  let weighted = 0;
  let weightSum = 0;
  for (const skill of skills) {
    const row = candidate.skills.find((entry) => entry.skillId === skill.skillId);
    const weight = weights[skill.skillId] ?? 0;
    if (!row || row.scoredCriteria === 0 || row.possible === 0 || weight <= 0) continue;
    weighted += (row.awarded / row.possible) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return null;
  return Math.round((weighted / weightSum) * 1000) / 10;
}

export default function RecruiterCompare() {
  const [searchParams] = useSearchParams();
  const attemptIds = (searchParams.get("attempts") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const [comparison, setComparison] = useState<ComparisonDetail | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(attemptIds.length >= 2);

  useEffect(() => {
    let cancelled = false;
    if (attemptIds.length < 2) return;
    compareSubmissions(attemptIds)
      .then((loaded) => {
        if (cancelled) return;
        setComparison(loaded);
        setWeights(defaultWeights(loaded.skills));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("One of those submissions is not available to you, or was not submitted.");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load this comparison.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The ids come from the URL; re-reading them on every render would refetch without a reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const displayError =
    error ??
    (attemptIds.length < 2 ? "Choose two to four submissions to compare." : null);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading comparison…
        </p>
      </DashboardLayout>
    );
  }

  if (displayError || !comparison) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{displayError ?? "Comparison not found."}</span>
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

  const { skills, candidates } = comparison;

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Version {comparison.version.versionNumber} · {candidates.length} candidates
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{comparison.version.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          A role-specific comparison using your own skill weights. The weighted score only counts
          skills the candidate has marks for, so a missing skill lowers the coverage instead of
          scoring zero. This is not a validated predictor of job performance.
        </p>
        <Link
          to="/recruiter"
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Side by side</h2>
          <button
            type="button"
            onClick={() => setWeights(defaultWeights(skills))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Scale className="h-3.5 w-3.5" aria-hidden />
            Reset weights
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3">
                  Skill
                </th>
                <th scope="col" className="py-2 pr-3">
                  Weight
                </th>
                {candidates.map((candidate) => (
                  <th key={candidate.attemptId} scope="col" className="py-2 pl-3">
                    <span className="block text-sm font-semibold normal-case text-slate-900">
                      {candidate.candidate.name}
                    </span>
                    <span className="block text-[11px] font-normal normal-case text-slate-500">
                      {candidate.awarded} / {candidate.possible} marks
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skills.map((skill) => (
                <tr key={skill.skillId}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{skill.name}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      aria-label={`Weight for ${skill.name}`}
                      value={weights[skill.skillId] ?? DEFAULT_WEIGHT}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setWeights((prev) => ({
                          ...prev,
                          [skill.skillId]: Number.isFinite(next) && next >= 0 ? next : 0,
                        }));
                      }}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </td>
                  {candidates.map((candidate) => {
                    const row = candidate.skills.find(
                      (entry) => entry.skillId === skill.skillId,
                    );
                    if (!row || row.scoredCriteria === 0) {
                      return (
                        <td
                          key={candidate.attemptId}
                          className="py-2 pl-3 text-xs italic text-slate-400"
                        >
                          Not assessed
                        </td>
                      );
                    }
                    return (
                      <td key={candidate.attemptId} className="py-2 pl-3 text-slate-800">
                        {row.awarded} / {row.possible}
                        <span className="ml-2 text-[11px] text-slate-500">
                          {row.scoredCriteria} of {row.criterionCount} marked
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">
                <td className="py-2 pr-3">Weighted score</td>
                <td className="py-2 pr-3 text-xs font-normal text-slate-500">percent</td>
                {candidates.map((candidate) => {
                  const percent = compositePercent(candidate, skills, weights);
                  return (
                    <td key={candidate.attemptId} className="py-2 pl-3">
                      {percent === null ? (
                        <span className="text-xs font-normal italic text-slate-400">
                          Not enough marks
                        </span>
                      ) : (
                        `${percent}%`
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="text-xs text-slate-500">
                <td className="py-1.5 pr-3">Coverage</td>
                <td className="py-1.5 pr-3" />
                {candidates.map((candidate) => (
                  <td key={candidate.attemptId} className="py-1.5 pl-3">
                    {candidate.criterionCount === 0
                      ? "—"
                      : `${Math.round((candidate.scoredCriteria / candidate.criterionCount) * 100)}% marked`}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
}
