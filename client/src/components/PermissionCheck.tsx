import { useState } from "react";
import { api, ApiError } from "../services/api";

type Result = { ok: boolean; text: string };

const checks = [
  { label: "Candidate-only endpoint", path: "/candidate/ping" },
  { label: "Recruiter-only endpoint", path: "/recruiter/ping" },
];

export default function PermissionCheck() {
  const [results, setResults] = useState<Record<string, Result>>({});

  async function run(path: string) {
    try {
      const r = await api.get<{ message: string }>(path);
      setResults((prev) => ({ ...prev, [path]: { ok: true, text: `200 OK: ${r.message}` } }));
    } catch (err) {
      const text =
        err instanceof ApiError ? `${err.status}: ${err.message}` : "Network error: is the server running?";
      setResults((prev) => ({ ...prev, [path]: { ok: false, text } }));
    }
  }

  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Permission check (temporary)
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Calls the backend role guards directly. Your own role's endpoint should succeed; the other
        should be refused with 403.
      </p>
      <div className="mt-4 space-y-3">
        {checks.map((c) => (
          <div key={c.path} className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => run(c.path)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              {c.label}
            </button>
            {results[c.path] && (
              <span className={`text-sm ${results[c.path].ok ? "text-emerald-700" : "text-red-700"}`}>
                {results[c.path].text}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}