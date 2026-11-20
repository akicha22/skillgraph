import { ArrowRight, BriefcaseBusiness, ClipboardCheck, FileText, GraduationCap, Share2 } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { buttonClasses } from "../components/ui/cx";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../hooks/useAuth";
import { dashboardPath } from "../types/auth";

export default function Home() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={dashboardPath(user.role)} replace />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4 md:px-6">
          <Logo />
        </div>
      </header>
      <main className="animate-fade-in">
        <section className="border-b border-brand-100 bg-linear-to-br from-brand-50 via-white to-brand-100">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
            <h1 className="max-w-3xl text-[1.875rem] leading-tight font-bold tracking-tight text-slate-900 md:text-4xl md:leading-[2.75rem]">
              Don’t just tell employers what you know. Show them what you can do.
            </h1>
            <p className="mt-4 max-w-xl text-slate-600">
              Practical skill assessments for candidates, and evidence-based talent discovery for recruiters.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register/candidate" className={buttonClasses()}>I’m a candidate <ArrowRight aria-hidden="true" className="size-4 shrink-0" /></Link>
              <Link to="/register/recruiter" className={buttonClasses({ variant: "secondary" })}>I’m a recruiter</Link>
              <Link to="/login" className={buttonClasses({ variant: "ghost" })}>Sign in</Link>
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 md:py-12">
          <section aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="mb-4 text-xl font-semibold tracking-tight">How it works</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {[
                { icon: FileText, title: "Choose a work scenario", text: "Start with a realistic situation and a practical task." },
                { icon: ClipboardCheck, title: "Do the work", text: "Work through the task and get scored against a rubric." },
                { icon: Share2, title: "Share the evidence", text: "Let recruiters see the work behind your skills." },
              ].map(({ icon: Icon, title, text }, index) => (
                <li key={title}>
                  <Card className="h-full">
                    <div className="mb-3 flex items-center gap-2 text-brand-700"><Icon className="size-5" aria-hidden="true" /><span className="text-sm font-semibold">Step {index + 1}</span></div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{text}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
          <section aria-label="Get started" className="grid gap-4 md:grid-cols-2">
            <Card>
              <GraduationCap aria-hidden="true" className="mb-3 size-5 text-brand-700" />
              <h2 className="text-xl font-semibold tracking-tight">For candidates</h2>
              <p className="mt-1 text-slate-600">Show employers what you can actually do.</p>
              <Link to="/register/candidate" className={buttonClasses({ className: "mt-4" })}>I’m a candidate</Link>
            </Card>
            <Card>
              <BriefcaseBusiness aria-hidden="true" className="mb-3 size-5 text-brand-700" />
              <h2 className="text-xl font-semibold tracking-tight">For recruiters</h2>
              <p className="mt-1 text-slate-600">Review evidence of demonstrated skills, not just résumés.</p>
              <Link to="/register/recruiter" className={buttonClasses({ variant: "secondary", className: "mt-4" })}>I’m a recruiter</Link>
            </Card>
          </section>
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <Logo size="sm" />
          <Link to="/login" className={buttonClasses({ variant: "ghost", size: "sm" })}>Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
