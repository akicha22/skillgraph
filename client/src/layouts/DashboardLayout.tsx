import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types/auth";

const navByRole: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  CANDIDATE: [
    { to: "/candidate", label: "Overview", end: true },
    { to: "/candidate/tasks", label: "Daily tasks" },
    { to: "/candidate/posts", label: "Opportunities" },
    { to: "/candidate/profile", label: "Profile" },
    { to: "/candidate/skills", label: "Skills" },
  ],
  RECRUITER: [
    { to: "/recruiter", label: "Overview", end: true },
    { to: "/recruiter/posts", label: "Requirements posts" },
    { to: "/recruiter/shortlists", label: "Shortlists" },
  ],
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-indigo-600">SkillGraph</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-700">{user?.name}</span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {user?.role === "CANDIDATE" ? "Candidate" : "Recruiter"}
            </span>
            {user?.isDemo && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Demo account
              </span>
            )}
            <button
              onClick={() => void logout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
        {user && (
          <nav className="mx-auto flex max-w-5xl gap-1 px-4" aria-label="Dashboard">
            {navByRole[user.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `border-b-2 px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">{children}</main>
    </div>
  );
}