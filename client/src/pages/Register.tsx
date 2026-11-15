import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";
import { dashboardPath, type Role } from "../types/auth";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

const copy = {
  CANDIDATE: {
    title: "Create your candidate account",
    subtitle: "Show employers what you can actually do.",
    switchLabel: "Hiring instead? Register as a recruiter",
    switchTo: "/register/recruiter",
  },
  RECRUITER: {
    title: "Create your recruiter account",
    subtitle: "Hire on demonstrated skills, not just résumés.",
    switchLabel: "Looking for work? Register as a candidate",
    switchTo: "/register/candidate",
  },
} as const;

export default function Register({ role }: { role: Role }) {
  const { user, loading, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  const c = copy[role];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register({ name, email, password, role });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      } else {
        setFormError("Could not reach the server. Is it running?");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title={c.title} subtitle={c.subtitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.name && <span className="mt-1 block text-xs text-red-600">{fieldErrors.name}</span>}
        </label>
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
          {fieldErrors.email && <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-slate-400">
            At least 8 characters, with a letter and a number.
          </span>
          {fieldErrors.password && (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.password}</span>
          )}
        </label>

        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-indigo-600 hover:underline">
          Sign in
        </Link>
        <br />
        <Link to={c.switchTo} className="font-medium text-indigo-600 hover:underline">
          {c.switchLabel}
        </Link>
      </p>
    </AuthCard>
  );
}