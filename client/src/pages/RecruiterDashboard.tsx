import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import PermissionCheck from "../components/PermissionCheck";
import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";

export default function RecruiterDashboard() {
  const { user } = useAuth();
  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
        <p className="mt-1 text-slate-600">
          Describe a role and SkillGraph builds a draft assessment with tasks, marks and rubrics you can review.
        </p>
        <Link
          to="/recruiter/assessments/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create assessment
        </Link>
      </section>
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Jobs, a history of your assessments and candidate evidence will appear here in later steps.
      </p>
      <PermissionCheck />
    </DashboardLayout>
  );
}