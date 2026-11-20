import { Button } from "./ui/Button";
import { Badge, Card } from "./ui/Card";
import { EmptyState } from "./ui/Feedback";
import { Input, Select } from "./ui/Field";
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
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
        <div className="relative min-w-0 basis-full sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, e.g. Excel, negotiation, drawing"
            aria-label="Search skills"
            className="pl-9"
          />
        </div>
        <Select
          value={domainSlug}
          onChange={(e) => setDomainSlug(e.target.value)}
          aria-label="Filter by domain"
          className="sm:w-auto"
        >
          <option value="all">All domains</option>
          {domains.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {selectedIds.length} selected{max !== undefined ? ` (up to ${max})` : ""}
        </span>
        {selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear selection
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <ul aria-label="Selected skills" className="mt-2 flex flex-wrap gap-2">
          {domains.flatMap((domain) => domain.skills.filter((skill) => selected.has(skill.id)).map((skill) => (
            <li key={skill.id} className="inline-flex max-w-full items-center rounded-full bg-brand-50 pl-3 text-sm text-brand-900">
              <span className="min-w-0 wrap-break-word">{skill.name}</span>
              <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Remove ${skill.name}`} onClick={() => toggle(skill.id)}>
                <X aria-hidden="true" className="size-4" />
              </Button>
            </li>
          )))}
        </ul>
      )}

      {visible.length === 0 && (
        <EmptyState title="No skills match your search." text="Try another search term or domain." />
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
                  <Card interactive
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={isSelected}
                    disabled={blocked}
                    className={`w-full p-4 text-left ${
                      isSelected
                        ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{s.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {s.assessmentTypes.map((t) => (
                        <Badge key={t}>
                          {TYPE_LABELS[t]}
                        </Badge>
                      ))}
                      {s.subskills.length > 0 && (
                        <span className="text-xs text-slate-600">{s.subskills.length} subskills</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}