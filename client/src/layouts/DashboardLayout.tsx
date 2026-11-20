import { BriefcaseBusiness, ClipboardList, House, ListChecks, Star, Trophy, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Card";
import { cx } from "../components/ui/cx";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types/auth";

const navByRole: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  CANDIDATE: [
    { to: "/candidate", label: "Overview", end: true },
    { to: "/candidate/tasks", label: "Daily tasks" },
    { to: "/candidate/leaderboard", label: "Leaderboard" },
    { to: "/candidate/posts", label: "Opportunities" },
    { to: "/candidate/profile", label: "Profile" },
    { to: "/candidate/skills", label: "Skills" },
  ],
  RECRUITER: [
    { to: "/recruiter", label: "Overview", end: true },
    { to: "/recruiter/leaderboard", label: "Leaderboard" },
    { to: "/recruiter/posts", label: "Requirements posts" },
    { to: "/recruiter/shortlists", label: "Shortlists" },
  ],
};

const navIcons: Record<string, LucideIcon> = {
  "/candidate": House,
  "/candidate/tasks": ListChecks,
  "/candidate/leaderboard": Trophy,
  "/candidate/posts": BriefcaseBusiness,
  "/candidate/profile": UserRound,
  "/candidate/skills": Star,
  "/recruiter": House,
  "/recruiter/leaderboard": Trophy,
  "/recruiter/posts": ClipboardList,
  "/recruiter/shortlists": ListChecks,
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50 focus:rounded-control focus:bg-white focus:p-3 focus:shadow-raised">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Logo size="sm" />
            {user && <Badge tone="brand">{user.role === "CANDIDATE" ? "Candidate" : "Recruiter"}</Badge>}
            {user?.isDemo && <Badge tone="accent">Demo account</Badge>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <span className="min-w-0 text-sm text-slate-700 wrap-break-word">{user?.name}</span>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>Sign out</Button>
          </div>
        </div>
        {user && (
          <nav aria-label="Dashboard" className="mx-auto hidden max-w-6xl flex-wrap gap-1 px-6 md:flex">
            {navByRole[user.role].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cx(
                "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium focus-visible:-outline-offset-2",
                isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1} className={cx(
        "mx-auto max-w-6xl animate-fade-in scroll-mt-32 space-y-6 px-4 pt-6 md:px-6 md:py-8",
        user ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-8",
      )}>
        {children}
      </main>
      {user && (
        <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-overlay md:hidden">
          <ul className="mx-auto grid max-w-lg grid-cols-3 gap-1">
            {navByRole[user.role].map((item) => {
              const Icon = navIcons[item.to];
              return (
                <li key={item.to} className="min-w-0">
                  <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(
                    "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1 text-center text-xs leading-tight wrap-break-word focus-visible:-outline-offset-2",
                    isActive ? "bg-brand-50 font-semibold text-brand-800" : "font-medium text-slate-600 hover:bg-slate-50",
                  )}>
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="max-w-full">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
