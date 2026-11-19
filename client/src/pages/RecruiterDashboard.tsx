import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Megaphone, Plus, Trash2 } from "lucide-react";
import PermissionCheck from "../components/PermissionCheck";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  createRecruiterPost,
  deleteRecruiterPost,
  listAssessments,
  listMyPosts,
  setRecruiterPostStatus,
} from "../services/assessments";
import type { AssessmentSummary, RecruiterPost } from "../types/assessments";

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<RecruiterPost[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const [creatingPost, setCreatingPost] = useState(false);
  const [removingPostId, setRemovingPostId] = useState<string | null>(null);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [postForm, setPostForm] = useState({
    title: "",
    companyName: "",
    location: "",
    requirements: "",
  });

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

  // Posts load separately: a failure there must not hide the assessment list.
  useEffect(() => {
    let cancelled = false;
    listMyPosts()
      .then((loaded) => {
        if (!cancelled) setPosts(loaded.posts);
      })
      .catch(() => {
        /* The dashboard still works without the posts section. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(field: keyof typeof postForm, value: string) {
    setPostForm((prev) => ({ ...prev, [field]: value }));
    setPostError(null);
    setPostNotice(null);
  }

  async function publishPost(event: FormEvent) {
    event.preventDefault();
    setCreatingPost(true);
    setPostError(null);
    setPostNotice(null);
    try {
      const created = await createRecruiterPost({
        title: postForm.title,
        companyName: postForm.companyName,
        location: postForm.location.trim() || undefined,
        requirements: postForm.requirements,
      });
      setPosts((prev) => [created.post, ...prev]);
      setPostForm({ title: "", companyName: "", location: "", requirements: "" });
      setPostNotice("Post published — candidates can see it now.");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not publish this post.");
    } finally {
      setCreatingPost(false);
    }
  }

  async function togglePostStatus(post: RecruiterPost) {
    const next = post.status === "OPEN" ? "CLOSED" : "OPEN";
    setUpdatingPostId(post.id);
    setPostError(null);
    setPostNotice(null);
    try {
      const updated = await setRecruiterPostStatus(post.id, next);
      setPosts((prev) => prev.map((entry) => (entry.id === post.id ? updated.post : entry)));
      setPostNotice(
        next === "OPEN"
          ? "Post reopened — candidates can see it again."
          : "Post closed — it is hidden from candidates but kept here.",
      );
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not change this post's status.");
    } finally {
      setUpdatingPostId(null);
    }
  }

  async function removePost(post: RecruiterPost) {
    if (!window.confirm(`Remove the post "${post.title}"?`)) return;
    setRemovingPostId(post.id);
    setPostError(null);
    try {
      await deleteRecruiterPost(post.id);
      setPosts((prev) => prev.filter((entry) => entry.id !== post.id));
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not remove this post.");
    } finally {
      setRemovingPostId(null);
    }
  }

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
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Requirements posts</h2>
          <span className="text-sm text-slate-500">
            {posts.filter((post) => post.status === "OPEN").length} open of {posts.length}
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Tell candidates what you are hiring for. Posts appear on every candidate dashboard; they
          are requirements, not assessments.
        </p>

        <form
          onSubmit={(event) => void publishPost(event)}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Post title
            </span>
            <input
              value={postForm.title}
              onChange={(event) => updateField("title", event.target.value)}
              maxLength={100}
              placeholder="Operations analyst - Bengaluru"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company
            </span>
            <input
              value={postForm.companyName}
              onChange={(event) => updateField("companyName", event.target.value)}
              maxLength={80}
              placeholder="Northline Trading"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Location (optional)
            </span>
            <input
              value={postForm.location}
              onChange={(event) => updateField("location", event.target.value)}
              maxLength={80}
              placeholder="On-site, Bengaluru"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Requirements
            </span>
            <textarea
              value={postForm.requirements}
              onChange={(event) => updateField("requirements", event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Two to three sentences on the role, the skills that matter and the start date."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={creatingPost}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Megaphone className="h-4 w-4" aria-hidden />
              {creatingPost ? "Publishing…" : "Publish post"}
            </button>
            {postNotice && <span className="text-xs text-emerald-700">{postNotice}</span>}
          </div>
        </form>
        {postError && <p className="mt-2 text-sm text-rose-700">{postError}</p>}

        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No posts yet. Publish one and candidates will see it on their dashboard.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{post.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        post.status === "OPEN"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {post.status === "OPEN" ? "Open" : "Closed"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {post.companyName}
                    {post.location ? ` · ${post.location}` : ""} ·{" "}
                    {new Date(post.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {post.requirements}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void togglePostStatus(post)}
                    disabled={updatingPostId === post.id}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {updatingPostId === post.id
                      ? "Saving…"
                      : post.status === "OPEN"
                        ? "Close post"
                        : "Reopen post"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removePost(post)}
                    disabled={removingPostId === post.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {removingPostId === post.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PermissionCheck />
    </DashboardLayout>
  );
}