import { Alert, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Spinner } from "../components/ui/Feedback";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Pencil,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import LocationInput from "../components/LocationInput";
import { useAuth } from "../hooks/useAuth";
import {
  deleteCandidateAccount,
  getCandidateProfile,
  updateCandidateProfile,
  updateLeaderboardOptIn,
} from "../services/assessments";
import type { CandidateProfileResponse } from "../types/assessments";

/** The candidate's own profile: who they are, what they can do, and how their attempts have gone. */
export default function CandidateProfile() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CandidateProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [leaderboardSaving, setLeaderboardSaving] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState({
    headline: "",
    location: "",
    about: "",
    yearsExperience: "",
  });

  useEffect(() => {
    let cancelled = false;
    getCandidateProfile()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setForm({
          headline: loaded.profile.headline ?? "",
          location: loaded.profile.location ?? "",
          about: loaded.profile.about ?? "",
          yearsExperience:
            loaded.profile.yearsExperience === null ? "" : String(loaded.profile.yearsExperience),
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your profile.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const years = form.yearsExperience.trim();
      const updated = await updateCandidateProfile({
        headline: form.headline,
        location: form.location,
        about: form.about,
        yearsExperience: years === "" ? null : Number(years),
      });
      setData((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, ...updated.profile } } : prev,
      );
      setEditing(false);
      setNotice("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleLeaderboard() {
    if (!data) return;
    const next = data.profile.leaderboardOptIn !== true;
    setLeaderboardSaving(true);
    setLeaderboardError(null);
    try {
      const updated = await updateLeaderboardOptIn(next);
      setData((prev) =>
        prev
          ? { ...prev, profile: { ...prev.profile, leaderboardOptIn: updated.leaderboardOptIn } }
          : prev,
      );
    } catch (err) {
      setLeaderboardError(
        err instanceof Error ? err.message : "Could not update the leaderboard setting.",
      );
    } finally {
      setLeaderboardSaving(false);
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError(null);
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setDeleting(true);
    try {
      await deleteCandidateAccount(deletePassword);
      await logout().catch(() => undefined);
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your account.");
      setDeleting(false);
    }
  }

  if (error && !data) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading your profile…
        </p>
      </DashboardLayout>
    );
  }

  const { profile, stats, skills, results } = data;
  const skillsByDomain = new Map<string, string[]>();
  for (const skill of skills) {
    skillsByDomain.set(skill.domain, [...(skillsByDomain.get(skill.domain) ?? []), skill.name]);
  }

  return (
    <DashboardLayout>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{profile.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {profile.headline ?? "Add a headline so recruiters know what you do."}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{profile.email}</span>
              {profile.location && <span>· {profile.location}</span>}
              {profile.yearsExperience !== null && (
                <span>· {profile.yearsExperience} years experience</span>
              )}
              <span>· Member since {new Date(profile.memberSince).toLocaleDateString()}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing((value) => !value);
              setNotice(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {editing ? "Close editor" : "Edit profile"}
          </button>
        </div>

        {profile.about && !editing && (
          <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {profile.about}
          </p>
        )}

        {editing && (
          <form onSubmit={(event) => void save(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="font-semibold">Profile details</h2>
              <p className="text-sm text-slate-600">Update what recruiters see about you.</p>
            </div>
            <Field label="Headline" className="sm:col-span-2">
              {(attributes) => <Input {...attributes} value={form.headline} onChange={(event) => setForm((prev) => ({ ...prev, headline: event.target.value }))} maxLength={100} placeholder="Operations analyst with a focus on supply planning" />}
            </Field>
            <Field label="Location" id="profile-location">
              {({ id }) => <LocationInput id={id} value={form.location} onChange={(value) => setForm((prev) => ({ ...prev, location: value }))} placeholder="Bengaluru" />}
            </Field>
            <Field label="Years of experience">
              {(attributes) => <Input {...attributes} type="number" min={0} max={50} value={form.yearsExperience} onChange={(event) => setForm((prev) => ({ ...prev, yearsExperience: event.target.value }))} placeholder="3" />}
            </Field>
            <Field label="About you" hint={`${form.about.length} / 600 characters`} className="sm:col-span-2">
              {(attributes) => <Textarea {...attributes} rows={5} maxLength={600} value={form.about} onChange={(event) => setForm((prev) => ({ ...prev, about: event.target.value }))} placeholder="What you have worked on, the problems you like, and what you are looking for next." />}
            </Field>
            <div className="sticky bottom-[calc(7rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-control border border-slate-200 bg-white p-3 shadow-raised sm:col-span-2 md:static md:border-0 md:p-0 md:shadow-none">
              <Button type="submit" loading={saving}>{saving ? "Saving…" : "Save profile"}</Button>
              {saving ? <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-600"><Spinner decorative /> Saving profile</span> : error && <Alert tone="error">{error}</Alert>}
            </div>
          </form>
        )}
        {notice && <Alert tone="success" role="status" className="mt-3">{notice}</Alert>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex rounded-lg bg-indigo-50 p-2 text-indigo-700">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Practice leaderboard</h2>
              <p className="mt-1 text-sm font-medium text-slate-800">
                Show my name on the practice leaderboard
              </p>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Off by default. When it is off, your name and points are hidden from the public
                list; you can still see your own totals.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={profile.leaderboardOptIn === true}
            aria-label="Show my name on the practice leaderboard"
            onClick={() => void toggleLeaderboard()}
            disabled={leaderboardSaving}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              profile.leaderboardOptIn === true ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                profile.leaderboardOptIn === true ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {leaderboardError && <p className="mt-3 text-sm text-rose-700">{leaderboardError}</p>}
      </Card>

      <Card className="border-rose-200">
        <div className="flex items-start gap-3">
          <span className="inline-flex rounded-lg bg-rose-50 p-2 text-rose-700">
            <Trash2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Delete my account and all my data
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              This permanently deletes your profile, assessment attempts, answers, practice
              history and leaderboard entry. This cannot be undone.
            </p>
          </div>
        </div>

        <form onSubmit={(event) => void deleteAccount(event)} className="mt-4 max-w-md">
          <Field label="Password" id="delete-account-password" required>
            {(attributes) => <Input {...attributes} type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Enter your password to confirm" />}
          </Field>
          {deleteError && <Alert tone="error" className="mt-3">{deleteError}</Alert>}
          {confirmingDelete ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-800">
                This is permanent. Delete your account and everything in it?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={deleting}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Yes, delete everything"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeletePassword("");
                    setDeleteError(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Delete my account and all my data
            </button>
          )}
        </form>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Available to attempt",
            value: stats.available,
            hint: "Published assessments you have not started",
            icon: ClipboardList,
            tone: "bg-indigo-50 text-indigo-700",
          },
          {
            label: "In progress",
            value: stats.inProgress,
            hint: "Started, not yet submitted",
            icon: BriefcaseBusiness,
            tone: "bg-amber-50 text-amber-700",
          },
          {
            label: "Submitted",
            value: stats.submitted,
            hint: `${stats.marked} fully marked · ${stats.awaitingMarks} awaiting marks`,
            icon: CheckCircle2,
            tone: "bg-emerald-50 text-emerald-700",
          },
          {
            label: "Average result",
            value: stats.averagePercent === null ? "—" : `${stats.averagePercent}%`,
            hint:
              stats.averagePercent === null
                ? "Appears once a criterion is marked"
                : "Across attempts that have marks",
            icon: TrendingUp,
            tone: "bg-slate-100 text-slate-700",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <span className={`inline-flex rounded-lg p-2 ${card.tone}`}>
              <card.icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
            <p className="text-sm font-medium text-slate-700">{card.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{card.hint}</p>
          </div>
        ))}
      </section>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Skills and areas of expertise</h2>
          <Link to="/candidate/skills" className="text-sm font-medium text-indigo-600 hover:underline">
            Update skills
          </Link>
        </div>
        {skills.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No skills chosen yet. Add a few and your daily practice tasks and assessment suggestions
            get sharper.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {[...skillsByDomain.entries()].map(([domain, names]) => (
              <div key={domain}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {domain}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {names.map((name) => (
                    <li
                      key={name}
                      className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Assessments you have submitted</h2>
          <Link to="/candidate" className="text-sm font-medium text-indigo-600 hover:underline">
            All assessments
          </Link>
        </div>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Nothing submitted yet. Attempt an assessment when you feel ready — your result appears
            here and on your dashboard.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {results.map((result) => (
              <li
                key={result.attemptId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{result.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {result.companyName} · {result.jobTitle}
                    {result.submittedAt
                      ? ` · submitted ${new Date(result.submittedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      result.scoredCriteria > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {result.scoredCriteria > 0 ? (
                      <>
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                        {result.awarded} / {result.possible}
                      </>
                    ) : (
                      "Marks pending"
                    )}
                  </span>
                  <Link
                    to={`/candidate/assessments/${result.versionId}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DashboardLayout>
  );
}
