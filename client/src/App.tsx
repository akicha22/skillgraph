import { useEffect, useState } from "react";

type Health = {
  status: string;
  database: string;
  users: number;
  aiProvider: string;
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("Cannot reach the backend"));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="w-96 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-semibold">SkillGraph</h1>
        <p className="mt-1 text-sm text-slate-400">Foundation check</p>

        {error && <p className="mt-6 text-red-400">{error}</p>}

        {health && (
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">API</dt><dd>{health.status}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Database</dt><dd>{health.database}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Users</dt><dd>{health.users}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">AI provider</dt><dd>{health.aiProvider}</dd></div>
          </dl>
        )}
      </div>
    </main>
  );
}