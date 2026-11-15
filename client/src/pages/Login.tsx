import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";
import { dashboardPath } from "../types/auth";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is it running?");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("Demo@12345");
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to SkillGraph.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Development only: fill a demo account
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fillDemo("recruiter@skillgraph.test")}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              Demo recruiter
            </button>
            <button
              type="button"
              onClick={() => fillDemo("candidate1@skillgraph.test")}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              Demo candidate
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link to="/register/candidate" className="font-medium text-indigo-600 hover:underline">
          Register as a candidate
        </Link>{" "}
        or{" "}
        <Link to="/register/recruiter" className="font-medium text-indigo-600 hover:underline">
          as a recruiter
        </Link>
        .
      </p>
    </AuthCard>
  );
}