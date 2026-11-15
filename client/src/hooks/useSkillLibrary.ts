import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { SkillDomain } from "../types/skills";

export function useSkillLibrary() {
  const [domains, setDomains] = useState<SkillDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ domains: SkillDomain[] }>("/skills")
      .then((r) => {
        if (!cancelled) setDomains(r.domains);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the skill library");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { domains, loading, error };
}