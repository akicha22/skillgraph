import { Alert, Badge, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
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
      <header>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">My skills</h1>
        <p className="mt-1 text-slate-600">
          Choose the skills you want to be known for. These are <strong>self-declared</strong>: they show what
          you say you can do. Verified results appear on your profile only after you complete assessments.
        </p>
      </header>

      <Card>
        {loading && !error && <div role="status" className="space-y-3"><span className="sr-only">Loading skills…</span><Skeleton className="h-11" /><Skeleton className="h-24" /></div>}
        {error && <Alert tone="error">{error}</Alert>}
        {!loading && !error && (
          <SkillPicker domains={domains} selectedIds={selected} onChange={setSelected} max={MAX_SKILLS} />
        )}
      </Card>

      {!loading && !error && (
        <section aria-labelledby="selected-skills" className="space-y-3">
          <h2 id="selected-skills" className="text-xl font-semibold tracking-tight">Selected skills</h2>
          {selected.length === 0 ? (
            <Card><EmptyState title="No skills selected" text="Choose skills from the library above." /></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {domains.flatMap((domain) => domain.skills.filter((skill) => selected.includes(skill.id)).map((skill) => (
                <Card key={skill.id}>
                  <Badge>{domain.name}</Badge>
                  <h3 className="mt-2 font-semibold wrap-break-word">{skill.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{skill.description}</p>
                </Card>
              )))}
            </div>
          )}
          <Card className="flex flex-wrap items-center justify-between gap-3">
            {message ? <Alert tone={message.ok ? "success" : "error"} role={message.ok ? "status" : undefined}>{message.text}</Alert> : (
              <span role="status" className="text-sm text-slate-600">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            )}
            <Button onClick={() => void handleSave()} disabled={!dirty || saving} loading={saving}>
              {saving ? "Saving…" : "Save skills"}
            </Button>
          </Card>
        </section>
      )}
    </DashboardLayout>
  );
}
