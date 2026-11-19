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
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-slate-600">
          Take the assessments you have open, revisit your finished ones, and see what recruiters are
          hiring for.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {open.length} open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {completed.length} completed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {posts?.length ?? 0} recruiter posts
          </span>
          <Link to="/candidate/skills" className="ml-auto font-medium text-indigo-600 hover:underline">
            Update your skills
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Open assessments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Assessments you have not submitted yet. Submitting locks your answers, so finish every task
          first.
        </p>
        {error ? (
          <p className="mt-2 text-sm text-rose-700">{error}</p>
        ) : assessments === null ? (
          <p className="mt-2 text-sm text-slate-600">Loading assessments…</p>
        ) : open.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Nothing open right now. Published assessments appear here as soon as a recruiter
            publishes one.
          </p>
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
                  className="mt-3 inline-block rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {assessment.attempt ? "Continue assessment" : "Open assessment"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Completed assessments</h2>
        <p className="mt-1 text-sm text-slate-600">
          Submitted attempts. Marks appear as the recruiter reviews each criterion.
        </p>
        {assessments === null ? (
          <p className="mt-2 text-sm text-slate-600">Loading completed assessments…</p>
        ) : completed.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">You have not submitted an assessment yet.</p>
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
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {assessment.attempt && assessment.attempt.awarded > 0
                      ? `${assessment.attempt.awarded} / ${assessment.attempt.possible}`
                      : "Marks pending"}
                  </span>
                  <Link
                    to={`/candidate/assessments/${assessment.id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    View result
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Recruiter posts</h2>
        <p className="mt-1 text-sm text-slate-600">
          What recruiters are hiring for right now. A post is a requirement, not an assessment.
        </p>
        {postsError ? (
          <p className="mt-2 text-sm text-rose-700">{postsError}</p>
        ) : posts === null ? (
          <p className="mt-2 text-sm text-slate-600">Loading posts…</p>
        ) : posts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No openings have been posted yet.</p>
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
      </section>
    </DashboardLayout>
  );
}
