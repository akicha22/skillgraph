import { Alert, Badge, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Field";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { buttonClasses } from "../components/ui/cx";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, MapPin, Search } from "lucide-react";
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
      <Card>
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
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by role, company, skill or city"
              aria-label="Search opportunities"
              className="pl-9"
            />
          </div>
          <Select
            value={workType}
            onChange={(event) => setWorkType(event.target.value as EmploymentType | "")}
            aria-label="Filter by work type"
            className="sm:w-auto"
          >
            <option value="">Any work type</option>
            {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((type) => (
              <option key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : posts === null ? (
        <Card role="status"><span className="sr-only">Loading opportunities…</span><Skeleton className="h-24" /></Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={<Briefcase className="size-5" />} title={posts.length ? "No matching opportunities" : "No openings yet"}
          text={posts.length === 0 ? "No openings have been posted yet. Check back soon." : "No openings match that search. Try a different skill, city or work type."}
          action={posts.length > 0 && (
            <Button variant="secondary" onClick={() => {
              setQuery("");
              setWorkType("");
            }}>Clear filters</Button>
          )}
        /></Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((post) => (
            <li key={post.id}>
              <Card className="p-0 hover:shadow-raised sm:p-0">
                <details open>
                  <summary className="min-h-11 cursor-pointer rounded-control p-4 sm:p-6">
                    <span className="ml-1 font-semibold">{post.title}</span>
                    <span className="ml-2 text-sm text-slate-600">{post.companyName}</span>
                  </summary>
                  <div className="border-t border-slate-200 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">

                {post.employmentType && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {EMPLOYMENT_TYPE_LABELS[post.employmentType as EmploymentType] ??
                      post.employmentType}
                  </span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">

                {post.location && (
                  <Badge className="items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {post.location}
                  </Badge>
                )}
                {post.experience && <span>{post.experience}</span>}
                <span>Posted {new Date(post.createdAt).toLocaleDateString()}</span>
              </p>
              {post.skills.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {post.skills.map((skill) => (
                    <li key={skill}><Badge tone="brand">{skill}</Badge></li>
                  ))}
                </ul>
              )}
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {post.requirements}
              </p>
              <p className="mt-3 text-xs text-slate-500">Posted by {post.recruiterName}</p>
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="border-brand-200 text-sm">
        <p className="font-medium">Want to show what you can do?</p>
        <p className="mt-1">
          Assessments are formal evaluations set by a recruiter. Daily tasks are practice: use them
          to prepare before you attempt one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/candidate/tasks"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Go to daily tasks
          </Link>
          <Link
            to="/candidate"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            See assessments
          </Link>
        </div>
      </Card>
    </DashboardLayout>
  );
}
