import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { dashboardPath, type Role } from "../types/auth";

export default function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  // Signed in, but the wrong role: send them to their own dashboard.
  if (user.role !== role) return <Navigate to={dashboardPath(user.role)} replace />;

  return <>{children}</>;
}