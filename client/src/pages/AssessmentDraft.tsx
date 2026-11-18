import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronRight, Eye, FileText, GitBranch, Lock, Pencil, Send } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import DraftEditForm from "../components/DraftEditForm";
import DataPreview from "../components/DataPreview";
import { createNewVersion, getDraft, listSubmissions, listVersions, publishVersion } from "../services/assessments";
import { ApiError } from "../services/api";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  METHOD_LABELS,
  TASK_TYPE_LABELS,
  type DraftTask,
  type DraftVersion,
  type SubmissionList,
  type VersionList,
} from "../types/assessments";

/** Turns a stored field name (e.g. `total_revenue`) into a label a person reads. */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function StatusBadge({ children, tone }: { children: string; tone: "draft" | "published" | "neutral" }) {
  const classes =
    tone === "published"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "draft"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>{children}</span>;
}

/** A collapsed panel for candidate data and recruiter-only material. */
function Disclosure({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {icon}
        {label}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/** Collapsed by default so a long assessment stays a short list until a task is opened. */
function TaskCard({ task }: { task: DraftTask }) {
  const hasPublicData = Object.keys(task.publicData).length > 0;
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5 hover:bg-slate-50">
        <div className="flex items-start gap-2">
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <div>
            <h3 className="font-semibold text-slate-900">
              {task.position + 1}. {task.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {TASK_TYPE_LABELS[task.type] ?? task.type}
              </span>
              <span>{task.skillName}</span>
              <span>·</span>
              <span>{task.marks} marks</span>
              <span>·</span>
              <span>{task.timeMinutes} min</span>
            </div>
          </div>
        </div>
        <span className="text-xs text-slate-500">
          {task.rubric.length} criteria{hasPublicData ? " · has data" : ""}
        </span>
      </summary>

      <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
        <p className="whitespace-pre-line text-sm text-slate-700">{task.prompt}</p>

        {hasPublicData && (
          <Disclosure label="Data given to the candidate" icon={<Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />}>
            <DataPreview data={task.publicData} />
          </Disclosure>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rubric</h4>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="pb-1">Criterion</th>
                <th scope="col" className="pb-1">What is checked</th>
                <th scope="col" className="pb-1 text-right">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {task.rubric.map((criterion) => (
                <tr key={criterion.position}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{criterion.name}</td>
                  <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                  <td className="py-2 text-right text-slate-700">{criterion.maxMarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.keys(task.privateData).length > 0 && (
          <Disclosure
            label="Recruiter only — answer key and marking guidance"
            icon={<Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          >
            <div className="space-y-3">
              {Object.entries(task.privateData)
                .filter(([key]) => key !== "rubric")
                .map(([key, value]) =>
                  typeof value === "object" && value !== null && !Array.isArray(value) ? (
                    <div key={key}>
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {humanize(key)}
                      </h5>
                      <table className="mt-1 w-full text-left text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(value as Record<string, unknown>).map(([name, expected]) => (
                            <tr key={name}>
                              <td className="py-1.5 pr-3 text-slate-700">{humanize(name)}</td>
                              <td className="py-1.5 font-medium text-slate-900">
                                {Array.isArray(expected) ? expected.join(", ") : String(expected)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p key={key} className="text-sm text-slate-700">
                      <span className="font-medium">{humanize(key)}:</span>{" "}
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </p>
                  ),
                )}
            </div>
            {task.rubric.some((criterion) => criterion.privateGuidance) && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {task.rubric
                  .filter((criterion) => criterion.privateGuidance)
                  .map((criterion) => (
                    <li key={`guidance-${criterion.position}`}>
                      <span className="font-medium">{criterion.name}:</span> {criterion.privateGuidance}
                    </li>
                  ))}
              </ul>
            )}
          </Disclosure>
        )}
      </div>
    </details>
  );
}

export default function AssessmentDraft() {
  const { assessmentId = "", versionId = "" } = useParams();
  // Keyed so switching versions remounts the loader with fresh state.
  return <DraftView key={`${assessmentId}:${versionId}`} assessmentId={assessmentId} versionId={versionId} />;
}

function DraftView({ assessmentId, versionId }: { assessmentId: string; versionId: string }) {
  const [draft, setDraft] = useState<DraftVersion | null>(null);
  const [versions, setVersions] = useState<VersionList["versions"]>([]);
  const [submissions, setSubmissions] = useState<SubmissionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [busyAction, setBusyAction] = useState<"publish" | "new-version" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionIssues, setActionIssues] = useState<{ field: string; message: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDraft(assessmentId, versionId), listVersions(assessmentId)])
      .then(([loadedDraft, versionList]) => {
        if (cancelled) return;
        setDraft(loadedDraft);
        setVersions(versionList.versions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this draft.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId, versionId]);

  // Submissions are informational here: a failure must not hide the version itself.
  useEffect(() => {
    let cancelled = false;
    listSubmissions(versionId)
      .then((list) => {
        if (!cancelled) setSubmissions(list);
      })
      .catch(() => {
        /* The version page still works without the submission list. */
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  function refreshVersions() {
    listVersions(assessmentId)
      .then((list) => setVersions(list.versions))
      .catch(() => {
        /* The version list is informational; a failed refresh must not hide the draft. */
      });
  }

  function handleSaved(saved: DraftVersion) {
    setDraft(saved);
    setEditing(false);
    setActionError(null);
    setActionIssues([]);
    refreshVersions();
  }

  function reportActionError(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      setActionError(err.message);
      setActionIssues(err.details);
      return;
    }
    setActionError(err instanceof Error ? err.message : fallback);
  }

  async function publish() {
    setActionError(null);
    setActionIssues([]);
    setBusyAction("publish");
    try {
      const published = await publishVersion(assessmentId, versionId);
      setDraft(published);
      setEditing(false);
      refreshVersions();
    } catch (err) {
      reportActionError(err, "Could not publish this version.");
    } finally {
      setBusyAction(null);
    }
  }

  async function startNewVersion() {
    setActionError(null);
    setActionIssues([]);
    setBusyAction("new-version");
    try {
      const created = await createNewVersion(assessmentId, versionId);
      navigate(`/recruiter/assessments/${created.assessmentId}/versions/${created.id}`);
    } catch (err) {
      reportActionError(err, "Could not create a new version.");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading draft…</p>
      </DashboardLayout>
    );
  }

  if (error || !draft) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error ?? "Draft not found."}</span>
          </p>
          <Link to="/recruiter" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-rose-700 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const marksOk = draft.totals.marks === 100;
  const weightsOk = draft.totals.weights === 100;

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {draft.assessment.companyName} · {draft.assessment.jobTitle}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{draft.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{draft.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge tone="neutral">{`Version ${draft.versionNumber}`}</StatusBadge>
              <StatusBadge tone={draft.status === "PUBLISHED" ? "published" : "draft"}>
                {draft.status === "PUBLISHED" ? "Published" : "Draft"}
              </StatusBadge>
              <StatusBadge tone="neutral">
                {METHOD_LABELS[draft.generationMethod] ?? draft.generationMethod}
              </StatusBadge>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {draft.editable && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setActionError(null);
                    setActionIssues([]);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit draft
                </button>
              )}
              {draft.editable && (
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={busyAction !== null || editing}
                  title={editing ? "Save or cancel your edits first" : undefined}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  {busyAction === "publish" ? "Publishing…" : "Publish version"}
                </button>
              )}
              {!draft.editable && (
                <button
                  type="button"
                  onClick={() => void startNewVersion()}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <GitBranch className="h-4 w-4" aria-hidden />
                  {busyAction === "new-version" ? "Creating…" : "Create new version"}
                </button>
              )}
            </div>
          </div>
        </div>

        {actionError && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{actionError}</span>
            </p>
            {actionIssues.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-8">
                {actionIssues.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>
                    <span className="font-medium">{issue.field}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Tasks</dt>
            <dd className="font-semibold text-slate-900">{draft.totals.taskCount}</dd>
          </div>
          <div className={`rounded-xl p-3 ${marksOk ? "bg-slate-50" : "bg-amber-50"}`}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total marks</dt>
            <dd className={`font-semibold ${marksOk ? "text-slate-900" : "text-amber-700"}`}>{draft.totals.marks}</dd>
          </div>
          <div className={`rounded-xl p-3 ${weightsOk ? "bg-slate-50" : "bg-amber-50"}`}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Skill weights</dt>
            <dd className={`font-semibold ${weightsOk ? "text-slate-900" : "text-amber-700"}`}>{draft.totals.weights}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Time</dt>
            <dd className="font-semibold text-slate-900">{draft.totals.durationMinutes} min</dd>
          </div>
        </dl>

        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {draft.editable
              ? "This version is a draft. Edit the wording, marks, minutes, rubric and weights, then publish to lock the criteria candidates will be scored against."
              : `Published${draft.publishedAt ? ` on ${new Date(draft.publishedAt).toLocaleDateString()}` : ""} and read-only — attempts are scored against these exact criteria. Create a new version to make changes.`}
          </span>
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {editing ? (
          <DraftEditForm draft={draft} onSaved={handleSaved} onCancel={() => setEditing(false)} />
        ) : (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Assessment brief</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Level</dt>
                <dd className="font-medium text-slate-900">
                  {LEVEL_LABELS[draft.targetLevel] ?? draft.targetLevel} ·{" "}
                  {DIFFICULTY_LABELS[draft.difficulty] ?? draft.difficulty}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">AI policy</dt>
                <dd className="font-medium text-slate-900">
                  {draft.aiPolicy === "NOT_ALLOWED" ? "AI not allowed" : "AI allowed if disclosed"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Context shown to candidates</dt>
                <dd className="mt-1 whitespace-pre-line text-slate-700">{draft.jobContext}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Candidate instructions
                </dt>
                <dd className="mt-1 whitespace-pre-line text-slate-700">{draft.candidateInstructions}</dd>
              </div>
            </dl>
          </div>

          {draft.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
        )}

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Skills and weights</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {draft.skills.map((skill) => (
                <li key={skill.skillSlug} className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium text-slate-900">{skill.name}</span>
                    {skill.subskills.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {skill.subskills.map((sub) => sub.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className={`font-semibold ${weightsOk ? "text-slate-700" : "text-amber-700"}`}>
                    {skill.weight}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Versions</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {versions.map((version) => {
                const current = version.id === draft.id;
                return (
                  <li key={version.id}>
                    <Link
                      to={`/recruiter/assessments/${draft.assessmentId}/versions/${version.id}`}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
                        current ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        v{version.versionNumber} · {version.taskCount} tasks · {version.durationMinutes} min
                      </span>
                      <span className="text-xs uppercase tracking-wide text-slate-500">{version.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {draft.status === "PUBLISHED" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Submissions</h2>
                {submissions && (
                  <span className="text-xs text-slate-500">{submissions.attempts.length}</span>
                )}
              </div>
              {!submissions ? (
                <p className="mt-3 text-sm text-slate-600">Loading submissions…</p>
              ) : submissions.attempts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No candidate has submitted this version yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {submissions.attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <Link
                        to={`/recruiter/attempts/${attempt.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50"
                      >
                        <span>
                          <span className="font-medium text-slate-900">
                            {attempt.candidateName}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {attempt.answeredTaskCount} of {submissions.version.taskCount} answered
                            {attempt.submittedAt
                              ? ` · ${new Date(attempt.submittedAt).toLocaleDateString()}`
                              : ""}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Link
            to="/recruiter"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </aside>
      </div>
    </DashboardLayout>
  );
}
