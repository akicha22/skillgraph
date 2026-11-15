import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { AssessmentType, SkillDomain } from "../types/skills";

const TYPE_LABELS: Record<AssessmentType, string> = {
  STRUCTURED_RESPONSE: "Written response",
  DATA_ANALYTICAL: "Data task",
  FILE_SUBMISSION: "File upload",
};

type Props = {
  domains: SkillDomain[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
};

export default function SkillPicker({ domains, selectedIds, onChange, max }: Props) {
  const [query, setQuery] = useState("");
  const [domainSlug, setDomainSlug] = useState("all");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const atLimit = max !== undefined && selectedIds.length >= max;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return domains
      .filter((d) => domainSlug === "all" || d.slug === domainSlug)
      .map((d) => ({
        ...d,
        skills: d.skills.filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.subskills.some((ss) => ss.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((d) => d.skills.length > 0);
  }, [domains, query, domainSlug]);

  function toggle(skillId: string) {
    if (selected.has(skillId)) {
      onChange(selectedIds.filter((id) => id !== skillId));
    } else if (!atLimit) {
      onChange([...selectedIds, skillId]);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, e.g. Excel, negotiation, drawing"
            aria-label="Search skills"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <select
          value={domainSlug}
          onChange={(e) => setDomainSlug(e.target.value)}
          aria-label="Filter by domain"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="all">All domains</option>
          {domains.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {selectedIds.length} selected{max !== undefined ? ` (up to ${max})` : ""}
        </span>
        {selectedIds.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="font-medium text-indigo-600 hover:underline">
            Clear selection
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="mt-8 text-center text-sm text-slate-500">No skills match your search.</p>
      )}

      <div className="mt-4 space-y-8">
        {visible.map((d) => (
          <section key={d.id}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{d.name}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {d.skills.map((s) => {
                const isSelected = selected.has(s.id);
                const blocked = atLimit && !isSelected;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={isSelected}
                    disabled={blocked}
                    className={`rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{s.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {s.assessmentTypes.map((t) => (
                        <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {TYPE_LABELS[t]}
                        </span>
                      ))}
                      {s.subskills.length > 0 && (
                        <span className="text-xs text-slate-400">{s.subskills.length} subskills</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}