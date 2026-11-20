import { Alert, Badge, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { ProgressBar, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Scale, Trophy } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  compareSubmissions,
  getComparisonWeights,
  saveComparisonWeights,
} from "../services/assessments";
import { ApiError } from "../services/api";
import type { ComparisonCandidate, ComparisonDetail } from "../types/assessments";

const DEFAULT_WEIGHT = 10;

/** Default weights sit flat, so a recruiter has to make a deliberate choice to bias the result. */
function defaultWeights(skills: ComparisonDetail["skills"]) {
  return Object.fromEntries(skills.map((skill) => [skill.skillId, DEFAULT_WEIGHT]));
}

/** Saved weights for the skills this version still has; anything else keeps the default. */
function mergeSavedWeights(
  skills: ComparisonDetail["skills"],
  saved: { skillId: string; weight: number }[],
) {
  const next = defaultWeights(skills);
  for (const row of saved) {
    if (row.skillId in next) next[row.skillId] = row.weight;
  }
  return next;
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
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [weightSaved, setWeightSaved] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (attemptIds.length < 2) return;
    compareSubmissions(attemptIds)
      .then(async (loaded) => {
        if (cancelled) return;
        setComparison(loaded);
        setWeights(defaultWeights(loaded.skills));
        try {
          const saved = await getComparisonWeights(loaded.version.id);
          if (cancelled || !saved.weights || saved.weights.length === 0) return;
          setWeights(mergeSavedWeights(loaded.skills, saved.weights));
          setSavedAt(saved.updatedAt);
        } catch {
          /* Saved weights are optional: the default 10 per skill still works. */
        }
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
        <div role="status" className="mt-3"><span className="sr-only">Loading comparison…</span><Skeleton className="h-16" /></div>
      </DashboardLayout>
    );
  }

  if (displayError || !comparison) {
    return (
      <DashboardLayout>
        <div className="space-y-3">
          <Alert tone="error">{displayError ?? "Comparison not found."}</Alert>
          <Link
            to="/recruiter"
            className={buttonClasses({ variant: "secondary" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  async function saveWeights() {
    if (!comparison) return;
    setSavingWeights(true);
    setWeightError(null);
    setWeightSaved(null);
    try {
      const payload = comparison.skills.map((skill) => ({
        skillId: skill.skillId,
        weight: Math.round(weights[skill.skillId] ?? DEFAULT_WEIGHT),
      }));
      const saved = await saveComparisonWeights(comparison.version.id, payload);
      setSavedAt(saved.updatedAt);
      setWeightSaved("Weights saved for this version.");
    } catch (err) {
      setWeightError(err instanceof Error ? err.message : "Could not save these weights.");
    } finally {
      setSavingWeights(false);
    }
  }

  const { skills, candidates } = comparison;
  const weightedScores = candidates.map((candidate) => compositePercent(candidate, skills, weights));
  const bestWeighted = Math.max(-Infinity, ...weightedScores.filter((score): score is number => score !== null));

  return (
    <DashboardLayout>
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Version {comparison.version.versionNumber} · {candidates.length} candidates
        </p>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight text-slate-900">{comparison.version.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          A role-specific comparison using your own skill weights. The weighted score only counts
          skills the candidate has marks for, so a missing skill lowers the coverage instead of
          scoring zero. This is not a validated predictor of job performance.
        </p>
        <Link
          to="/recruiter"
          className={buttonClasses({ variant: "secondary", className: "mt-3" })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Side by side</h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void saveWeights()}
              disabled={savingWeights}
              variant="primary" size="sm"
            >
              {savingWeights ? "Saving…" : "Save weights"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setWeights(defaultWeights(skills));
                setSavedAt(null);
                setWeightError(null);
                setWeightSaved(null);
              }}
              variant="secondary" size="sm"
            >
              <Scale className="h-3.5 w-3.5" aria-hidden />
              Reset weights
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {savedAt
            ? `Your saved weighting was applied (last saved ${new Date(savedAt).toLocaleString()}).`
            : "Weighted with the default 10 per skill. Save to keep your weighting for this version."}
        </p>
        {weightError && <Alert tone="error" className="mt-3">{weightError}</Alert>}
        {weightSaved && !weightError && (
          <Alert tone="success" role="status" className="mt-3">{weightSaved}</Alert>
        )}

        <div className="mt-4 max-w-full overflow-x-auto" role="region" aria-label="Candidate comparison" tabIndex={0}>
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-3">
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
                    {candidate.possible > 0 && <ProgressBar className="mt-1" label={`${candidate.candidate.name}: total marks`} value={candidate.awarded} max={candidate.possible} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skills.map((skill) => {
                const best = Math.max(-Infinity, ...candidates.flatMap((candidate) => candidate.skills
                  .filter((row) => row.skillId === skill.skillId && row.scoredCriteria > 0 && row.possible > 0)
                  .map((row) => row.awarded / row.possible)));
                return (
                <tr key={skill.skillId}>
                  <th scope="row" className="sticky left-0 z-10 max-w-32 bg-white px-2 py-3 font-medium wrap-break-word text-slate-800">{skill.name}</th>
                  <td className="py-2 pr-3">
                    <Input
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
                      className="w-20 text-right"
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
                          className="py-2 pl-3 text-xs italic text-slate-600"
                        >
                          Not assessed
                        </td>
                      );
                    }
                    return (
                      <td key={candidate.attemptId} className="py-2 pl-3 text-slate-800">
                        <div className="min-w-28 space-y-1 py-1">
                          <span>{row.awarded} / {row.possible}</span>
                          {row.possible > 0 && <ProgressBar label={`${candidate.candidate.name}: ${skill.name} score`} value={row.awarded} max={row.possible} />}
                          {row.possible > 0 && row.awarded / row.possible === best && <Badge tone="accent" className="items-center gap-1"><Trophy aria-hidden="true" className="size-3" /> Best</Badge>}
                        </div>
                        <span className="text-xs text-slate-500">
                          {row.scoredCriteria} of {row.criterionCount} marked
                        </span>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-2 py-3">Weighted score</th>
                <td className="py-2 pr-3 text-xs font-normal text-slate-500">percent</td>
                {candidates.map((candidate, index) => {
                  const percent = weightedScores[index];
                  return (
                    <td key={candidate.attemptId} className="py-2 pl-3">
                      {percent === null ? (
                        <span className="text-xs font-normal italic text-slate-600">
                          Not enough marks
                        </span>
                      ) : (
                        <div className="min-w-28 space-y-1 py-1">
                          <span>{percent}%</span>
                          <ProgressBar label={`${candidate.candidate.name}: weighted score`} value={percent} />
                          {percent === bestWeighted && <Badge tone="accent" className="items-center gap-1"><Trophy aria-hidden="true" className="size-3" /> Best</Badge>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="text-xs text-slate-500">
                <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-3">Coverage</th>
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
      </Card>
    </DashboardLayout>
  );
}
