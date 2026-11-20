import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthCard, { PasswordInput } from "../components/AuthCard";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Field";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";
import { dashboardPath, type Role } from "../types/auth";

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
        <Field label="Full name" required error={fieldErrors.name}>
          {(attributes) => <Input {...attributes} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Email" required error={fieldErrors.email}>
          {(attributes) => <Input {...attributes} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" required hint="At least 8 characters, with a letter and a number." error={fieldErrors.password}>
          {(attributes) => <PasswordInput {...attributes} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>

        {formError && <Alert tone="error">{formError}</Alert>}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
        <br />
        <Link to={c.switchTo} className="font-medium text-brand-700 hover:underline">
          {c.switchLabel}
        </Link>
      </p>
    </AuthCard>
  );
}