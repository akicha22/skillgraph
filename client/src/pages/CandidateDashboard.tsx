import { Link } from "react-router-dom";
import PermissionCheck from "../components/PermissionCheck";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";

export default function CandidateDashboard() {
  const { user } = useAuth();
  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-slate-600">
          This is your candidate dashboard. Assessments and results will appear here in later steps.
        </p>
        <Link
          to="/candidate/skills"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Choose your skills
        </Link>
      </section>
      <PermissionCheck />
    </DashboardLayout>
  );
}