import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { dashboardPath } from "../types/auth";

export default function Home() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">SkillGraph</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-900">
          Don’t just tell employers what you know. Show them what you can do.
        </h1>
        <p className="mt-4 text-slate-600">
          Practical skill assessments for candidates, and evidence-based talent discovery for recruiters.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/register/candidate"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
          >
            I’m a candidate
          </Link>
          <Link
            to="/register/recruiter"
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700"
          >
            I’m a recruiter
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}