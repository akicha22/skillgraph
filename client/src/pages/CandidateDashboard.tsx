import { Alert, Badge, Card, StatTile } from "../components/ui/Card";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, Megaphone } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import { listCandidateAssessments, listCandidatePosts } from "../services/assessments";
import type { CandidateAssessmentSummary, CandidatePost } from "../types/assessments";

/** The candidate's home: what to take, what is done, and what recruiters are hiring for. */
export default function CandidateDashboard() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<CandidateAssessmentSummary[] | null>(null);
  const [posts, setPosts] = useState<CandidatePost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);

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

  // Posts are their own section: a failure there must not hide the candidate's own work.
  useEffect(() => {
    let cancelled = false;
    listCandidatePosts()
      .then((loaded) => {
        if (!cancelled) setPosts(loaded.posts);
      })
      .catch((err) => {
        if (cancelled) return;
        setPostsError(err instanceof Error ? err.message : "Could not load recruiter posts.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = assessments?.filter((assessment) => assessment.attempt?.status !== "SUBMITTED") ?? [];
  const completed =
    assessments?.filter((assessment) => assessment.attempt?.status === "SUBMITTED") ?? [];

  return (
    <DashboardLayout>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Welcome, {user?.name}</h1>
          <p className="mt-1 text-slate-600">Take the assessments you have open, revisit your finished ones, and see what recruiters are hiring for.</p>
        </div>
        {open[0] && <Link to={`/candidate/assessments/${open[0].id}`} className={buttonClasses()}>{open[0].attempt ? "Continue assessment" : "Open next assessment"}</Link>}
      </header>
      <section aria-label="Your activity" className="grid gap-3 sm:grid-cols-3">
        {assessments && <StatTile label="Open assessments" value={open.length} icon={<ClipboardList className="size-4" />} />}
        {assessments && <StatTile label="Completed assessments" value={completed.length} icon={<CheckCircle2 className="size-4" />} />}
        {posts && <StatTile label="Recruiter posts" value={posts.length} icon={<Megaphone className="size-4" />} />}
      </section>
      <nav aria-label="Candidate shortcuts" className="flex flex-wrap gap-2">
        <Link to="/candidate/tasks" className={buttonClasses({ variant: "secondary" })}>Daily tasks</Link>
        <Link to="/candidate/posts" className={buttonClasses({ variant: "secondary" })}>Opportunities</Link>
        <Link to="/candidate/profile" className={buttonClasses({ variant: "secondary" })}>Your profile</Link>
      </nav>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/candidate/tasks"
          className="block rounded-card"
        >
          <Card className="h-full motion-safe:transition-shadow hover:shadow-raised">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Practise</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Today&apos;s practice tasks</h2>
          <p className="mt-1 text-sm text-slate-600">
            Short drills from your skills. Unmarked and private — preparation, not an exam.
          </p>
          </Card>
        </Link>
        <Link
          to="/candidate/posts"
          className="block rounded-card"
        >
          <Card className="h-full motion-safe:transition-shadow hover:shadow-raised">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Discover</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Open roles</h2>
          <p className="mt-1 text-sm text-slate-600">
            Requirements posts from recruiters, with the skills and experience each role needs.
          </p>
          </Card>
        </Link>
      </section>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Open assessments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Assessments you have not submitted yet. Submitting locks your answers, so finish every task
          first.
        </p>
        {error ? (
          <Alert tone="error" className="mt-3">{error}</Alert>
        ) : assessments === null ? (
          <div role="status" className="mt-3 space-y-2"><span className="sr-only">Loading assessments…</span><Skeleton className="h-16" /></div>
        ) : open.length === 0 ? (
          <EmptyState title="Nothing open right now" text="Published assessments appear here as soon as a recruiter publishes one." action={<Link to="/candidate/tasks" className={buttonClasses({ variant: "secondary" })}>Daily tasks</Link>} />
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((assessment) => (
              <li key={assessment.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {assessment.companyName} · {assessment.jobTitle}
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">{assessment.title}</h3>
                <p className="mt-1 text-xs text-slate-600">
                  {assessment.taskCount} tasks · {assessment.durationMinutes} min
                  {assessment.attempt ? " · in progress" : ""}
                </p>
                <Link
                  to={`/candidate/assessments/${assessment.id}`}
                  className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
                >
                  {assessment.attempt ? "Continue assessment" : "Open assessment"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Completed assessments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Submitted attempts. Marks appear as the recruiter reviews each criterion.
        </p>
        {error ? (
          <Alert tone="error" className="mt-3">{error}</Alert>
        ) : assessments === null ? (
          <div role="status" className="mt-3 space-y-2"><span className="sr-only">Loading completed assessments…</span><Skeleton className="h-16" /></div>
        ) : completed.length === 0 ? (
          <EmptyState title="No completed assessments" text="You have not submitted an assessment yet." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {completed.map((assessment) => (
              <li
                key={assessment.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{assessment.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {assessment.companyName} · {assessment.jobTitle}
                    {assessment.attempt?.submittedAt
                      ? ` · submitted ${new Date(assessment.attempt.submittedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="success" className="tabular-nums">
                    {assessment.attempt && assessment.attempt.awarded > 0
                      ? `${assessment.attempt.awarded} / ${assessment.attempt.possible}`
                      : "Marks pending"}
                  </Badge>
                  <Link
                    to={`/candidate/assessments/${assessment.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    View result
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Opportunities for you</h2>
          <Link to="/candidate/posts" className="text-sm font-medium text-brand-700 hover:underline">
            See all openings
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          What recruiters are hiring for right now. A post is a requirement, not an assessment.
        </p>
        {postsError ? (
          <Alert tone="error" className="mt-3">{postsError}</Alert>
        ) : posts === null ? (
          <div role="status" className="mt-3 space-y-2"><span className="sr-only">Loading posts…</span><Skeleton className="h-16" /></div>
        ) : posts.length === 0 ? (
          <EmptyState title="No openings yet" text="No openings have been posted yet." />
        ) : (
          <ul className="mt-3 space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {post.companyName}
                  {post.location ? ` · ${post.location}` : ""}
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">{post.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{post.requirements}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Posted by {post.recruiterName} · {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DashboardLayout>
  );
}
