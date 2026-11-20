import { Alert, Badge, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea } from "../components/ui/Field";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import LocationInput from "../components/LocationInput";
import {
  createRecruiterPost,
  deleteRecruiterPost,
  listMyPosts,
  setRecruiterPostStatus,
  updateRecruiterPost,
} from "../services/assessments";
import {
  EMPLOYMENT_TYPE_LABELS,
  type EmploymentType,
  type RecruiterPost,
} from "../types/assessments";

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

const EMPTY_FORM = {
  title: "",
  companyName: "",
  location: "",
  employmentType: "" as EmploymentType | "",
  experience: "",
  skills: "",
  requirements: "",
};

/**
 * Requirements posts: the recruiter's hiring needs, managed separately from assessments.
 * A post says what the role needs; an assessment is how a candidate is later evaluated.
 */
export default function RecruiterPosts() {
  const [posts, setPosts] = useState<RecruiterPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyPosts()
      .then((loaded) => {
        if (!cancelled) setPosts(loaded.posts);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load your posts.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
    setNotice(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  }

  function startEdit(post: RecruiterPost) {
    setForm({
      title: post.title,
      companyName: post.companyName,
      location: post.location ?? "",
      employmentType: (post.employmentType as EmploymentType | null) ?? "",
      experience: post.experience ?? "",
      skills: post.skills.join(", "),
      requirements: post.requirements,
    });
    setEditingId(post.id);
    setFormError(null);
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setNotice(null);

    const skills = form.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 12);

    const payload = {
      title: form.title,
      companyName: form.companyName,
      location: form.location.trim() || undefined,
      requirements: form.requirements,
      skills,
      experience: form.experience.trim() || undefined,
      employmentType: form.employmentType || undefined,
    };

    try {
      if (editingId) {
        const updated = await updateRecruiterPost(editingId, payload);
        setPosts((prev) =>
          prev ? prev.map((post) => (post.id === editingId ? updated.post : post)) : prev,
        );
        setNotice("Post updated — candidates see the new details straight away.");
      } else {
        const created = await createRecruiterPost(payload);
        setPosts((prev) => [created.post, ...(prev ?? [])]);
        setNotice("Post published — it now appears on the candidate opportunities page.");
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this post.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(post: RecruiterPost) {
    const next = post.status === "OPEN" ? "CLOSED" : "OPEN";
    setBusyId(post.id);
    setFormError(null);
    setNotice(null);
    try {
      const updated = await setRecruiterPostStatus(post.id, next);
      setPosts((prev) =>
        prev ? prev.map((entry) => (entry.id === post.id ? updated.post : entry)) : prev,
      );
      setNotice(
        next === "OPEN"
          ? "Post reopened — candidates can see it again."
          : "Post closed — it is hidden from candidates but kept here.",
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not change this post's status.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(post: RecruiterPost) {
    if (!window.confirm(`Remove the post "${post.title}"? This cannot be undone.`)) return;
    setBusyId(post.id);
    setFormError(null);
    try {
      await deleteRecruiterPost(post.id);
      setPosts((prev) => (prev ? prev.filter((entry) => entry.id !== post.id) : prev));
      if (editingId === post.id) resetForm();
      setNotice("Post removed.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not remove this post.");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = posts?.filter((post) => post.status === "OPEN").length ?? 0;
  const visible =
    posts?.filter((post) => (filter === "ALL" ? true : post.status === filter)) ?? [];

  return (
    <DashboardLayout>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">Requirements posts</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Describe the roles you are hiring for. Candidates see open posts in their opportunities
              section. A post states a requirement; it is not an assessment and carries no marks.
            </p>
          </div>
          <Link
            to="/recruiter/assessments/new"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create an assessment
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            {openCount} open
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            {(posts?.length ?? 0) - openCount} closed
          </span>
        </div>
      </Card>

      <form
        ref={formRef}
        onSubmit={(event) => void submit(event)}
        className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId ? "Edit post" : "Write a post"}
          </h2>
          {editingId && (
            <Button
              type="button"
              onClick={resetForm}
              variant="secondary" size="sm"
            >
              <X className="h-4 w-4" aria-hidden />
              Cancel edit
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role title <span className="text-rose-600">*</span>
            </span>
            <Input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              maxLength={100}
              placeholder="Operations analyst"
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company <span className="text-rose-600">*</span>
            </span>
            <Input
              value={form.companyName}
              onChange={(event) => updateField("companyName", event.target.value)}
              maxLength={80}
              placeholder="Northline Trading"
              className={fieldClass}
            />
          </label>

          <div className="text-sm">
            <label
              htmlFor="post-location"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Location
            </label>
            <div className="mt-1">
              <LocationInput
                id="post-location"
                value={form.location}
                onChange={(value) => updateField("location", value)}
                placeholder="Bengaluru"
              />
            </div>
          </div>

          <div className="text-sm">
            <label
              htmlFor="post-employment"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Work type
            </label>
            <Select
              id="post-employment"
              value={form.employmentType}
              onChange={(event) => updateField("employmentType", event.target.value)}
              className={fieldClass}
            >
              <option value="">Not specified</option>
              {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>

          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Experience
            </span>
            <Input
              value={form.experience}
              onChange={(event) => updateField("experience", event.target.value)}
              maxLength={60}
              placeholder="2–4 years"
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Skills
            </span>
            <Input
              value={form.skills}
              onChange={(event) => updateField("skills", event.target.value)}
              placeholder="Excel, client communication, negotiation"
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-slate-500">Separate skills with commas.</span>
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              What the role expects <span className="text-rose-600">*</span>
            </span>
            <Textarea
              value={form.requirements}
              onChange={(event) => updateField("requirements", event.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What the person will do, the skills that matter, the experience you expect and anything else a candidate should know before applying."
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {form.requirements.length} / 2000 characters
            </span>
          </label>
        </div>

        {formError && (
          <Alert tone="error">{formError}</Alert>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={saving}
            variant="primary" size="sm"
          >
            <Megaphone className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : editingId ? "Save changes" : "Publish post"}
          </Button>
          {notice && <span className="text-xs text-emerald-700">{notice}</span>}
        </div>
      </form>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Your posts</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(["ALL", "OPEN", "CLOSED"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`min-h-11 rounded-md px-2.5 py-1 font-medium ${
                  filter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
              >
                {value === "ALL" ? "All" : value === "OPEN" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>

        {loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : posts === null ? (
          <div role="status" className="mt-3"><span className="sr-only">Loading your posts…</span><Skeleton className="h-16" /></div>
        ) : visible.length === 0 ? (
          <EmptyState title="No posts to show" text={posts.length === 0
            ? "No posts yet. Write one above and it appears on every candidate's opportunities page."
            : `No ${filter.toLowerCase()} posts. Switch the filter to see the others.`} />
        ) : (
          <table role="table" aria-label="Requirements posts" className="mt-4 block w-full text-left md:table md:table-fixed">
            <thead className="hidden md:table-header-group"><tr><th scope="col" className="p-3">Opportunity</th><th scope="col" className="w-28 p-3">Status</th><th scope="col" className="w-40 p-3">Actions</th></tr></thead>
            <tbody role="rowgroup" className="block space-y-3 md:table-row-group md:space-y-0">
            {visible.map((post) => (
              <tr role="row" key={post.id} className="block rounded-card border border-slate-200 bg-white shadow-card md:table-row md:rounded-none md:shadow-none">
                  <td role="cell" className="block p-4 align-top wrap-break-word md:table-cell">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{post.title}</h3>
                      {post.employmentType && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {EMPLOYMENT_TYPE_LABELS[post.employmentType as EmploymentType] ??
                            post.employmentType}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {post.companyName}
                      {post.location ? ` · ${post.location}` : ""}
                      {post.experience ? ` · ${post.experience}` : ""} · posted{" "}
                      {new Date(post.createdAt).toLocaleDateString()}
                    </p>
                    {post.skills.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {post.skills.map((skill) => (
                          <li
                            key={skill}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {skill}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                      {post.requirements}
                    </p>
                  </td>
                  <td role="cell" className="block px-4 pb-2 align-top md:table-cell md:py-4"><Badge tone={post.status === "OPEN" ? "success" : "neutral"}>{post.status === "OPEN" ? "Open" : "Closed"}</Badge></td>
                  <td role="cell" className="block px-4 pb-4 align-top md:table-cell md:py-4"><div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => startEdit(post)}
                      variant="secondary" size="sm"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void toggleStatus(post)}
                      disabled={busyId === post.id}
                      variant="secondary" size="sm"
                    >
                      {busyId === post.id
                        ? "Saving…"
                        : post.status === "OPEN"
                          ? "Close post"
                          : "Reopen post"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void remove(post)}
                      disabled={busyId === post.id}
                      variant="danger" size="sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </Button>
                  </div></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </DashboardLayout>
  );
}
