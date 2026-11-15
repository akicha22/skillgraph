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
          This is your recruiter dashboard. Jobs, the AI assessment generator and candidate evidence will
          appear here in later steps.
        </p>
      </section>
      <PermissionCheck />
    </DashboardLayout>
  );
}