import { useEffect, useState } from "react";
import SkillPicker from "../components/SkillPicker";
import { useSkillLibrary } from "../hooks/useSkillLibrary";
import DashboardLayout from "../layouts/DashboardLayout";
import { api, ApiError } from "../services/api";

const MAX_SKILLS = 60;

export default function MySkills() {
  const { domains, loading: libraryLoading, error: libraryError } = useSkillLibrary();
  const [saved, setSaved] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ skillIds: string[] }>("/candidate/skills")
      .then((r) => {
        if (cancelled) return;
        setSaved(r.skillIds);
        setSelected(r.skillIds);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load your skills");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    saved !== null && (saved.length !== selected.length || selected.some((id) => !saved.includes(id)));

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const r = await api.put<{ skillIds: string[] }>("/candidate/skills", { skillIds: selected });
      setSaved(r.skillIds);
      setSelected(r.skillIds);
      setMessage({ ok: true, text: "Your skills were saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Could not reach the server." });
    } finally {
      setSaving(false);
    }
  }

  const loading = libraryLoading || (saved === null && !loadError);
  const error = libraryError ?? loadError;

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">My skills</h1>
        <p className="mt-1 text-slate-600">
          Choose the skills you want to be known for. These are <strong>self-declared</strong>: they show what
          you say you can do. Verified results appear on your profile only after you complete assessments.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        {loading && <p className="text-slate-500">Loading skills…</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!loading && !error && (
          <SkillPicker domains={domains} selectedIds={selected} onChange={setSelected} max={MAX_SKILLS} />
        )}
      </section>

      {!loading && !error && (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
          <span
            className={`text-sm ${message ? (message.ok ? "text-emerald-700" : "text-red-700") : "text-slate-500"}`}
            role="status"
          >
            {message ? message.text : dirty ? "You have unsaved changes." : "All changes saved."}
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save skills"}
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}