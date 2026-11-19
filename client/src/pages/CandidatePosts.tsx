import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Briefcase, MapPin, Search } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import { listCandidatePosts } from "../services/assessments";
import {
  EMPLOYMENT_TYPE_LABELS,
  type CandidatePost,
  type EmploymentType,
} from "../types/assessments";

/** Open roles from every recruiter, in one place. A post is a requirement, not an assessment. */
export default function CandidatePosts() {
  const [posts, setPosts] = useState<CandidatePost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [workType, setWorkType] = useState<EmploymentType | "">("");

  useEffect(() => {
    let cancelled = false;
    listCandidatePosts()
      .then((loaded) => {
        if (!cancelled) setPosts(loaded.posts);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load openings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!posts) return [];
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (workType && post.employmentType !== workType) return false;
      if (!needle) return true;
      return [post.title, post.companyName, post.location ?? "", post.requirements, ...post.skills]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [posts, query, workType]);

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Opportunities</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Roles recruiters are hiring for right now. These are their requirements — the assessment
          comes later, when you choose to attempt one.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by role, company, skill or city"
              aria-label="Search opportunities"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={workType}
            onChange={(event) => setWorkType(event.target.value as EmploymentType | "")}
            aria-label="Filter by work type"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Any work type</option>
            {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((type) => (
              <option key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <p className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : posts === null ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading opportunities…
        </p>
      ) : visible.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Briefcase className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
          <p className="mt-2 text-sm text-slate-600">
            {posts.length === 0
              ? "No openings have been posted yet. Check back soon."
              : "No openings match that search. Try a different skill, city or work type."}
          </p>
          {posts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setWorkType("");
              }}
              className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </section>
      ) : (
        <ul className="space-y-3">
          {visible.map((post) => (
            <li key={post.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{post.title}</h2>
                {post.employmentType && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {EMPLOYMENT_TYPE_LABELS[post.employmentType as EmploymentType] ??
                      post.employmentType}
                  </span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{post.companyName}</span>
                {post.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {post.location}
                  </span>
                )}
                {post.experience && <span>{post.experience}</span>}
                <span>Posted {new Date(post.createdAt).toLocaleDateString()}</span>
              </p>
              {post.skills.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {post.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {post.requirements}
              </p>
              <p className="mt-3 text-xs text-slate-500">Posted by {post.recruiterName}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900">
        <p className="font-medium">Want to show what you can do?</p>
        <p className="mt-1">
          Assessments are formal evaluations set by a recruiter. Daily tasks are practice: use them
          to prepare before you attempt one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/candidate/tasks"
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Go to daily tasks
          </Link>
          <Link
            to="/candidate"
            className="rounded-lg border border-indigo-300 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
          >
            See assessments
          </Link>
        </div>
      </section>
    </DashboardLayout>
  );
}
