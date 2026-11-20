import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Trophy, Users } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getLeaderboard } from "../services/assessments";
import type { LeaderboardResponse } from "../types/assessments";

function rankStyle(rank: number): string {
  if (rank === 1) return "bg-amber-100 text-amber-800";
  if (rank === 2) return "bg-slate-200 text-slate-700";
  if (rank === 3) return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-600";
}

/** Daily-practice points leaderboard, for candidates and recruiters. */
export default function Leaderboard() {
  const { user } = useAuth();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the leaderboard.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCandidate = user?.role === "CANDIDATE";
  const totals = data
    ? data.entries.reduce(
        (sum, entry) => ({
          points: sum.points + entry.points,
          solved: sum.solved + entry.tasksSolved,
        }),
        { points: 0, solved: 0 },
      )
    : { points: 0, solved: 0 };

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Trophy className="h-6 w-6 text-indigo-600" aria-hidden />
              Leaderboard
            </h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              {isCandidate
                ? "How you rank against other candidates on points earned from daily practice. Solving a task on the first try earns its full points; a retry earns half."
                : "Candidates ranked by total points earned in daily practice. These points are separate from formal assessment marks."}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {isCandidate ? (
                <>
                  Only candidates who opted in from their{" "}
                  <Link
                    to="/candidate/profile"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    profile settings
                  </Link>{" "}
                  are listed.
                </>
              ) : (
                "Only candidates who opted in from their profile settings are listed."
              )}
            </p>
          </div>
          <Link
            to={isCandidate ? "/candidate/tasks" : "/recruiter"}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {isCandidate ? "Practise today" : "Back to overview"}
          </Link>
        </div>
      </section>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {data === null && !error && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading the rankings…
        </p>
      )}

      {data && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            {isCandidate ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Your rank
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {data.me.rank === null ? "Unranked" : `#${data.me.rank}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {data.me.rank === null
                      ? "Solve a daily task to enter the rankings."
                      : `of ${data.entries.length} ranked candidate${data.entries.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Your points
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-700">{data.me.points}</p>
                  <p className="mt-1 text-xs text-slate-500">Earned from daily practice</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tasks solved
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {data.me.tasksSolved}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Every correct submission counts once
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ranked candidates
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {data.entries.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Candidates with points</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Points awarded
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-700">{totals.points}</p>
                  <p className="mt-1 text-xs text-slate-500">Across daily practice</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tasks solved
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.solved}</p>
                  <p className="mt-1 text-xs text-slate-500">Correct submissions to date</p>
                </div>
              </>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {data.entries.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
                <h2 className="mt-2 text-lg font-semibold text-slate-900">No points yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                  The leaderboard opens as soon as a candidate solves a daily task correctly.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Rank
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Candidate
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Tasks solved
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.entries.map((entry, index) => (
                      <tr
                        key={`${entry.rank}-${entry.name}-${index}`}
                        className={entry.isMe ? "bg-indigo-50/70" : undefined}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${rankStyle(entry.rank)}`}
                          >
                            {entry.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {entry.name}
                          {entry.isMe && (
                            <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              You
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {entry.tasksSolved}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {entry.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Ranked by total points. Candidates on equal points share a rank. Only practice points
            and task counts are shown — answers and notes stay private to each candidate.
          </p>
        </>
      )}
    </DashboardLayout>
  );
}
