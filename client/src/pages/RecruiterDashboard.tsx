import { Alert, Badge, Card, StatTile } from "../components/ui/Card";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import { listAssessments, listMyPosts } from "../services/assessments";
import type { AssessmentSummary, RecruiterPost } from "../types/assessments";

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<RecruiterPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAssessments()
      .then((list) => {
        if (!cancelled) setAssessments(list.assessments);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your assessments.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Posts load separately: a failure there must not hide the assessment list.
  useEffect(() => {
    let cancelled = false;
    listMyPosts()
      .then((loaded) => {
        if (!cancelled) setPosts(loaded.posts);
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPosts = posts?.filter((post) => post.status === "OPEN") ?? [];

  return (
    <DashboardLayout>
      <header>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-slate-600">
          Two separate things live here: requirements posts describe the roles you are hiring for,
          and assessments are how candidates are actually evaluated.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/recruiter/assessments/new"
            className={buttonClasses()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create assessment
          </Link>
          <Link
            to="/recruiter/posts"
            className={buttonClasses({ variant: "secondary" })}
          >
            <Megaphone className="h-4 w-4" aria-hidden />
            Publish a requirements post
          </Link>
        </div>
      </header>

      <section aria-label="Recruiting activity" className="grid gap-3 sm:grid-cols-3">
        {!loading && !error && <StatTile label="Assessments" value={assessments.length} />}
        {posts && <><StatTile label="Open posts" value={openPosts.length} /><StatTile label="Total posts" value={posts.length} /></>}
      </section>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Your assessments</h2>
          {!loading && !error && (
            <span className="text-sm text-slate-500">
              {assessments.length} {assessments.length === 1 ? "assessment" : "assessments"}
            </span>
          )}
        </div>

        {loading && <div role="status" className="mt-3"><span className="sr-only">Loading assessments…</span><Skeleton className="h-16" /></div>}

        {!loading && error && (
          <Alert tone="error">{error}</Alert>
        )}

        {!loading && !error && assessments.length === 0 && (
          <EmptyState title="No assessments yet" text="Describe a role and SkillGraph will draft the first one — tasks, marks and rubrics included." action={<Link to="/recruiter/assessments/new" className={buttonClasses()}>Create assessment</Link>} />
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
                        {assessment.versionCount} · {latest.taskCount} tasks ·{" "}
                        {latest.durationMinutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={latest.status === "PUBLISHED" ? "success" : "warning"}>
                        {latest.status === "PUBLISHED" ? "Published" : "Draft"}
                      </Badge>
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
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Requirements posts</h2>
          <Link
            to="/recruiter/posts"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Manage posts
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {posts === null
            ? "Loading your posts…"
            : `${openPosts.length} open ${openPosts.length === 1 ? "post" : "posts"} of ${
                posts.length
              } — candidates see the open ones under Opportunities.`}
        </p>
        {posts !== null && posts.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {posts.slice(0, 3).map((post) => (
              <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{post.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {post.companyName}
                    {post.location ? ` · ${post.location}` : ""}
                  </p>
                </div>
                <Badge tone={post.status === "OPEN" ? "success" : "neutral"}>
                  {post.status === "OPEN" ? "Open" : "Closed"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {posts !== null && posts.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">
            No posts yet.{" "}
            <Link to="/recruiter/posts" className="font-medium text-indigo-600 hover:underline">
              Write the first one
            </Link>
            .
          </p>
        )}
      </Card>
    </DashboardLayout>
  );
}
