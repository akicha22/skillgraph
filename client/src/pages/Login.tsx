import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthCard, { PasswordInput } from "../components/AuthCard";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Field";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";
import { dashboardPath } from "../types/auth";

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
        <Field label="Email" required>
          {(attributes) => <Input {...attributes} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" required>
          {(attributes) => <PasswordInput {...attributes} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Development only: fill a demo account
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fillDemo("recruiter@skillgraph.test")}
            >
              Demo recruiter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fillDemo("candidate1@skillgraph.test")}
            >
              Demo candidate
            </Button>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{" "}
        <Link to="/register/candidate" className="font-medium text-brand-700 hover:underline">
          Register as a candidate
        </Link>{" "}
        or{" "}
        <Link to="/register/recruiter" className="font-medium text-brand-700 hover:underline">
          as a recruiter
        </Link>
        .
      </p>
    </AuthCard>
  );
}