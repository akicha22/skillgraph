import { Alert, Badge, Card, StatTile } from "../components/ui/Card";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Users } from "lucide-react";
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
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-tight text-slate-900">
              <Trophy className="h-6 w-6 text-brand-700" aria-hidden />
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
                    className="font-medium text-brand-700 hover:underline"
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
            className={buttonClasses()}
          >
            {isCandidate ? "Practise today" : "Back to overview"}
          </Link>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {data === null && !error && (
        <Card role="status" className="space-y-3">
          <span className="sr-only">Loading the rankings…</span>
          <Skeleton className="h-6 w-1/3" /><Skeleton className="h-24" />
        </Card>
      )}

      {data && (
        <div className="space-y-6 tabular-nums">
          <section aria-label="Ranking summary" className="grid gap-4 sm:grid-cols-3">
            {isCandidate ? (
              <>
                <StatTile label="Your rank" value={data.me.rank ?? "—"} detail={data.me.rank === null
                  ? "Solve a daily task to enter the rankings."
                  : `of ${data.entries.length} ranked candidate${data.entries.length === 1 ? "" : "s"}`} />
                <StatTile label="Your points" value={data.me.points} detail="Earned from daily practice" />
                <StatTile label="Tasks solved" value={data.me.tasksSolved} detail="Every correct submission counts once" />
              </>
            ) : (
              <>
                <StatTile label="Ranked candidates" value={data.entries.length} detail="Candidates with points" />
                <StatTile label="Points awarded" value={totals.points} detail="Across daily practice" />
                <StatTile label="Tasks solved" value={totals.solved} detail="Correct submissions to date" />
              </>
            )}
          </section>
          {data.entries.length > 0 && (
            <section aria-labelledby="podium-heading" className="hidden md:block">
              <h2 id="podium-heading" className="mb-3 text-xl font-semibold tracking-tight">Podium</h2>
              <ol className="grid grid-cols-3 items-end gap-4">
                {data.entries.slice(0, 3).map((entry, index) => (
                  <li key={`${entry.rank}-${entry.name}-${index}`} className={index === 0 ? "col-start-2 row-start-1" : index === 1 ? "col-start-1 row-start-1" : "col-start-3 row-start-1"}>
                    <Card className={`text-center wrap-break-word ${index === 0 ? "min-h-44 border-accent-200" : "min-h-36"} ${entry.isMe ? "ring-2 ring-brand-500" : ""}`}>
                      <Badge tone="accent">Rank {entry.rank}</Badge>
                      <p className="mt-2 font-semibold">{entry.name}{entry.isMe && <Badge tone="brand" className="ml-2">You</Badge>}</p>
                      <p className="mt-1 text-sm text-slate-600">{entry.points} points</p>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <Card>
            {data.entries.length === 0 ? (
              <EmptyState icon={<Users className="size-5" />} title="No points yet" text="The leaderboard opens as soon as a candidate solves a daily task correctly." action={isCandidate ? <Link to="/candidate/tasks" className={buttonClasses()}>Practise today</Link> : undefined} />
            ) : (
              <>
                <h2 className="mb-3 text-xl font-semibold tracking-tight">Rankings</h2>
                <ol className="space-y-2">
                  {data.entries.map((entry, index) => (
                    <li key={`${entry.rank}-${entry.name}-${index}`} className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-x-6 ${entry.isMe ? "bg-brand-50 ring-1 ring-brand-200" : "bg-slate-50"}`}>
                      <span className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${rankStyle(entry.rank)}`}><span className="sr-only">Rank </span>{entry.rank}</span>
                      <span className="min-w-0 font-medium wrap-break-word">{entry.name}{entry.isMe && <Badge tone="brand" className="ml-2">You</Badge>}</span>
                      <span className="col-start-2 text-sm text-slate-600 md:col-start-auto">{entry.tasksSolved} tasks solved</span>
                      <span className="col-start-2 text-sm font-semibold md:col-start-auto">{entry.points} points</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>

          <p className="text-xs text-slate-500">
            Ranked by total points. Candidates on equal points share a rank. Only practice points
            and task counts are shown — answers and notes stay private to each candidate.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
