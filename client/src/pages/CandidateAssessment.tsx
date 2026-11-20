import { Button } from "../components/ui/Button";
import { Alert, Badge, Card } from "../components/ui/Card";
import { Skeleton, Spinner } from "../components/ui/Feedback";
import { Textarea } from "../components/ui/Field";
import { buttonClasses } from "../components/ui/cx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  CircleCheck,
  FileText,
  Table2,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import DataPreview from "../components/DataPreview";
import {
  agreeToCandidateConsent,
  getAttemptFollowUps,
  getCandidateAssessment,
  getCandidateAttempt,
  getCandidateProfile,
  postAttemptEvents,
  saveAttemptFollowUp,
  saveCandidateAnswer,
  startCandidateAttempt,
  submitCandidateAttempt,
} from "../services/assessments";
import { ApiError } from "../services/api";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  TASK_TYPE_LABELS,
  type AttemptEventInput,
  type CandidateAssessmentDetail,
  type CandidateAttempt,
  type CandidateFollowUps,
} from "../types/assessments";

export default function CandidateAssessmentPage() {
  const { versionId = "" } = useParams();
  const [assessment, setAssessment] = useState<CandidateAssessmentDetail | null>(null);
  const [assessmentVersionId, setAssessmentVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<CandidateAttempt | null>(null);
  // Which version the loaded attempt belongs to, so a switch never shows another one's answers.
  const [attemptVersionId, setAttemptVersionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null | undefined>(undefined);
  const [consentDismissed, setConsentDismissed] = useState(false);
  const [acceptingConsent, setAcceptingConsent] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [reloadingQuestions, setReloadingQuestions] = useState(false);
  // One task is shown at a time; the strip above the slide switches between them.
  const [activeIndex, setActiveIndex] = useState(0);
  // Follow-up questions open only after submission, and answering them is optional.
  const [followUps, setFollowUps] = useState<CandidateFollowUps | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const submittedAttemptId =
    attempt?.status === "SUBMITTED" && attemptVersionId === versionId ? attempt.id : null;

  const eventQueueRef = useRef<AttemptEventInput[]>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const lastOpenedTaskRef = useRef<string | null>(null);

  const visibleTaskId =
    assessment && assessment.tasks.length > 0
      ? assessment.tasks[Math.min(activeIndex, assessment.tasks.length - 1)]?.id
      : undefined;
  const eventAttempt =
    attemptVersionId === versionId && assessmentVersionId === versionId ? attempt : null;
  const eventAttemptId = eventAttempt?.id ?? null;
  const eventsEnabled =
    eventAttempt?.status === "IN_PROGRESS" && typeof consentAt === "string";

  const flushEvents = useCallback(() => {
    if (!eventsEnabled || !eventAttemptId) return Promise.resolve();
    if (flushPromiseRef.current) return flushPromiseRef.current;

    const run = (async () => {
      while (eventQueueRef.current.length > 0) {
        const batch = eventQueueRef.current.splice(0, 50);
        try {
          await postAttemptEvents(eventAttemptId, batch);
        } catch {
          // Activity tracking is best-effort; never surface or block on it.
          break;
        }
      }
    })().finally(() => {
      flushPromiseRef.current = null;
    });

    flushPromiseRef.current = run;
    return run;
  }, [eventAttemptId, eventsEnabled]);

  useEffect(() => {
    eventQueueRef.current = [];
    lastOpenedTaskRef.current = null;
  }, [attempt?.id, versionId]);

  useEffect(() => {
    if (!eventsEnabled || !eventAttemptId || !visibleTaskId) {
      lastOpenedTaskRef.current = null;
      return;
    }
    const key = `${eventAttemptId}:${visibleTaskId}`;
    if (lastOpenedTaskRef.current === key) return;
    lastOpenedTaskRef.current = key;
    eventQueueRef.current.push({ type: "TASK_OPENED", taskId: visibleTaskId });
  }, [eventAttemptId, eventsEnabled, visibleTaskId]);

  useEffect(() => {
    if (!eventsEnabled) return;
    const timer = window.setInterval(() => {
      void flushEvents();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [eventsEnabled, flushEvents]);

  useEffect(() => {
    if (!eventsEnabled) return;
    const handleVisibilityChange = () => {
      if (!eventsEnabled) return;
      eventQueueRef.current.push({
        type: document.visibilityState === "hidden" ? "FOCUS_LOST" : "FOCUS_RESTORED",
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [eventsEnabled]);

  useEffect(() => {
    let cancelled = false;
    getCandidateAssessment(versionId)
      .then((loaded) => {
        if (cancelled) return;
        setAssessment(loaded);
        setAssessmentVersionId(versionId);
        setActiveIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("This assessment is not available. It may not be published yet, or the link is wrong.");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load this assessment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  // Opens in the attempt's real state instead of pretending nothing was started yet.
  useEffect(() => {
    let cancelled = false;
    getCandidateAttempt(versionId)
      .then(({ attempt: existing }) => {
        if (cancelled) return;
        setAttempt(existing);
        setDrafts(
          existing
            ? Object.fromEntries(existing.responses.map((row) => [row.taskId, row.answer]))
            : {},
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setAttemptError(err instanceof Error ? err.message : "Could not load your saved answers.");
      })
      .finally(() => {
        if (!cancelled) setAttemptVersionId(versionId);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  // The consent notice is about a new attempt; a failed read falls back to the server's 403.
  useEffect(() => {
    let cancelled = false;
    getCandidateProfile()
      .then(({ profile }) => {
        if (!cancelled) setConsentAt(profile.consentAt);
      })
      .catch(() => {
        // The start endpoint still enforces consent if the profile cannot be read now.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The questions are derived server-side from the rubric, so the candidate sees exactly what the
  // recruiter sees, with any answer already written.
  useEffect(() => {
    if (!submittedAttemptId) return;
    let cancelled = false;
    getAttemptFollowUps(submittedAttemptId)
      .then((loaded) => {
        if (cancelled) return;
        setFollowUps(loaded);
        setFollowUpDrafts(
          Object.fromEntries(loaded.questions.map((row) => [row.criterionId, row.answer])),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFollowUpError(
          err instanceof Error ? err.message : "Could not load the follow-up questions.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [submittedAttemptId]);

  async function saveFollowUp(criterionId: string) {
    if (!submittedAttemptId) return;
    setFollowUpBusyId(criterionId);
    setFollowUpError(null);
    const answer = followUpDrafts[criterionId] ?? "";
    try {
      await saveAttemptFollowUp(submittedAttemptId, criterionId, answer);
      setFollowUps((prev) => {
        if (!prev) return prev;
        const questions = prev.questions.map((row) =>
          row.criterionId === criterionId ? { ...row, answer } : row,
        );
        return {
          ...prev,
          questions,
          answeredCount: questions.filter((row) => row.answer.trim().length > 0).length,
        };
      });
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Could not save that answer.");
    } finally {
      setFollowUpBusyId(null);
    }
  }

  async function startAttempt() {
    setStarting(true);
    setAttemptError(null);
    try {
      const started = await startCandidateAttempt(versionId);
      setAttempt(started);
      setDrafts(Object.fromEntries(started.responses.map((row) => [row.taskId, row.answer])));
      setActiveIndex(0);
      // The questions are only sent once an attempt exists, so the page re-reads them now.
      setAssessment(await getCandidateAssessment(versionId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setConsentAt(null);
        setConsentDismissed(false);
        setAttemptError(null);
        return;
      }
      setAttemptError(
        err instanceof Error
          ? err.message
          : "Could not start this assessment. Reload the page and try again.",
      );
    } finally {
      setStarting(false);
    }
  }

  function beginAttempt() {
    if (consentAt === null) {
      setConsentDismissed(false);
      return;
    }
    void startAttempt();
  }

  async function agreeAndStart() {
    setAcceptingConsent(true);
    setAttemptError(null);
    try {
      const consent = await agreeToCandidateConsent();
      setConsentAt(consent.consentAt);
      setConsentDismissed(true);
      await startAttempt();
    } catch (err) {
      setAttemptError(
        err instanceof Error ? err.message : "Could not record your agreement.",
      );
    } finally {
      setAcceptingConsent(false);
    }
  }

  async function reloadQuestions() {
    setReloadingQuestions(true);
    setAttemptError(null);
    try {
      setAssessment(await getCandidateAssessment(versionId));
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not load the questions.");
    } finally {
      setReloadingQuestions(false);
    }
  }

  async function submitAttempt() {
    if (!attempt) return;
    setSubmitting(true);
    setAttemptError(null);
    try {
      // Send queued activity before the attempt locks; failures are already swallowed.
      await flushEvents();
      setAttempt(await submitCandidateAttempt(attempt.id));
      setConfirmingSubmit(false);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not submit this attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAnswer(taskId: string) {
    if (!attempt) return;
    setSavingTaskId(taskId);
    setSavedTaskId(null);
    setAttemptError(null);
    try {
      const saved = await saveCandidateAnswer(attempt.id, taskId, drafts[taskId] ?? "");
      setAttempt(
        (prev) =>
          prev && {
            ...prev,
            responses: [...prev.responses.filter((row) => row.taskId !== taskId), saved],
          },
      );
      setSavedTaskId(taskId);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : "Could not save that answer.");
    } finally {
      setSavingTaskId(null);
    }
  }

  const activeAttempt = attemptVersionId === versionId ? attempt : null;
  const attemptLoading = attemptVersionId !== versionId;

  if (loading) {
    return (
      <DashboardLayout>
        <Card role="status" className="space-y-4">
          <span className="sr-only">Loading assessment…</span>
          <Skeleton className="h-8 w-2/3" /><Skeleton className="h-28" />
        </Card>
      </DashboardLayout>
    );
  }

  if (error || !assessment) {
    return (
      <DashboardLayout>
        <Card>
          <Alert tone="error">{error ?? "Assessment not found."}</Alert>
          <Link
            to="/candidate"
            className={buttonClasses({ variant: "secondary", className: "mt-3" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </Card>
      </DashboardLayout>
    );
  }

  const tasks = assessment.tasks;
  const totalMarks = tasks.reduce((sum, task) => sum + task.marks, 0);
  const safeIndex = tasks.length > 0 ? Math.min(activeIndex, tasks.length - 1) : 0;
  const activeTask = tasks[safeIndex] ?? null;
  const savedTaskIds = new Set(
    (activeAttempt?.responses ?? [])
      .filter((response) => response.answer.trim().length > 0)
      .map((response) => response.taskId),
  );
  const savedCount = savedTaskIds.size;
  const questionsReady = assessment.started;
  // Marks arrive only once the attempt is submitted; nothing here is marking guidance.
  const result = activeAttempt?.status === "SUBMITTED" ? activeAttempt.result : null;
  const awardedByCriterion = new Map(
    (result?.criteria ?? []).map((row) => [`${row.taskId}:${row.position}`, row.awarded] as const),
  );
  const awardedForTask = (taskId: string) => {
    const rows = result?.criteria.filter((row) => row.taskId === taskId) ?? [];
    const scored = rows.filter((row) => row.awarded !== null);
    if (scored.length === 0) return null;
    return {
      awarded: scored.reduce((sum, row) => sum + (row.awarded ?? 0), 0),
      scored: scored.length,
      count: rows.length,
    };
  };

  return (
    <DashboardLayout>
      <Card className="sticky top-28 z-20 p-3 sm:p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">{assessment.assessment.companyName} · {assessment.assessment.jobTitle}</p>
            <h1 className="mt-1 text-lg leading-tight font-semibold tracking-tight wrap-break-word sm:text-xl">{assessment.title}</h1>
          </div>
          {activeAttempt && (
            <div role="status" className="shrink-0">
              {savingTaskId ? (
                <Badge tone="brand" className="items-center gap-1.5"><Spinner decorative /> Saving answer…</Badge>
              ) : attemptError ? (
                <Badge tone="danger" className="items-center gap-1.5"><AlertTriangle aria-hidden="true" className="size-4" /> Attempt action failed</Badge>
              ) : activeAttempt.status === "SUBMITTED" ? (
                <Badge tone="success" className="items-center gap-1.5"><CircleCheck aria-hidden="true" className="size-4" /> Submitted</Badge>
              ) : savedCount > 0 ? (
                <Badge tone="success" className="items-center gap-1.5 tabular-nums"><CircleCheck aria-hidden="true" className="size-4" /> {savedCount} of {tasks.length} tasks saved</Badge>
              ) : (
                <Badge className="items-center gap-1.5"><FileText aria-hidden="true" className="size-4" /> No answers saved yet</Badge>
              )}
            </div>
          )}
        </header>
      </Card>
      <Card>
        <p className="mt-2 text-sm text-slate-600">{assessment.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{tasks.length} tasks</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{totalMarks} marks</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {assessment.durationMinutes} min
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {LEVEL_LABELS[assessment.targetLevel] ?? assessment.targetLevel} ·{" "}
            {DIFFICULTY_LABELS[assessment.difficulty] ?? assessment.difficulty}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5">
            {assessment.aiPolicy === "NOT_ALLOWED" ? "AI not allowed" : "AI allowed if disclosed"}
          </span>
        </div>
      </Card>

      {attemptLoading ? (
        <Card role="status" className="space-y-3"><span className="sr-only">Checking your attempt…</span><Skeleton className="h-6 w-1/2" /><Skeleton className="h-20" /></Card>
      ) : !activeAttempt ? (
        <>
          {consentAt === null && !consentDismissed ? (
            <Card className="border-brand-200">
              <Alert tone="info" heading="Before you start: what this attempt records">
              <p className="mt-1 text-sm text-brand-900">
                To keep the assessment fair, this attempt records:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-brand-900">
                <li>your answers and each saved revision;</li>
                <li>when you open a task and when an answer is saved;</li>
                <li>paste events as a size only, never the pasted text;</li>
                <li>when the tab loses focus.</li>
              </ul>
              <p className="mt-3 text-sm text-brand-900">
                Only the recruiter who owns this assessment can see this record. You can delete
                your account and all of this data at any time from your{" "}
                <Link to="/candidate/profile" className="font-medium underline">
                  profile
                </Link>
                .
              </p>
              </Alert>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => void agreeAndStart()}
                  disabled={starting || acceptingConsent}
                  variant="primary"
                >
                  {acceptingConsent ? "Starting…" : "I agree and start"}
                </Button>
                <Button
                  onClick={() => setConsentDismissed(true)}
                  disabled={starting || acceptingConsent}
                  variant="secondary"
                >
                  Not now
                </Button>
              </div>
              {attemptError && <Alert tone="error" className="mt-3">{attemptError}</Alert>}
            </Card>
          ) : (
            <Card className="border-brand-200">
              <h2 className="text-lg font-semibold text-slate-900">Ready to start?</h2>
              <p className="mt-1 text-sm text-brand-900">
                You will see one task at a time and can move between them. Each task has its own
                answer box, and saved answers are kept if you come back later.
              </p>
              <Button
                onClick={beginAttempt}
                disabled={starting || acceptingConsent}
                variant="primary" className="mt-3"
              >
                {starting ? "Starting…" : "Start answering"}
              </Button>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Before you start</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
              {assessment.jobContext}
            </p>
            <h3 className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Instructions
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
              {assessment.candidateInstructions}
            </p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">What you will be asked</h2>
            <p className="mt-1 text-sm text-slate-600">
              These are the topics. The tasks themselves open when you start, so you are not reading
              questions before you are ready.
            </p>
            <ol className="mt-4 divide-y divide-slate-100">
              {tasks.map((task, index) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{task.skillName}</p>
                      <p className="text-xs text-slate-500">
                        {TASK_TYPE_LABELS[task.type] ?? task.type}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {task.marks} marks · {task.timeMinutes} min
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : !questionsReady || !activeTask ? (
        <Card className="border-amber-200">
          <h2 className="text-lg font-semibold text-slate-900">Your attempt is started</h2>
          <p className="mt-1 text-sm text-amber-900">
            The tasks could not be loaded just now. Your saved answers are safe — load the tasks to
            carry on.
          </p>
          <Button
            onClick={() => void reloadQuestions()}
            disabled={reloadingQuestions}
            variant="secondary" className="mt-3"
          >
            {reloadingQuestions ? "Loading…" : "Load the tasks"}
          </Button>
          {attemptError && <Alert tone="error" className="mt-3">{attemptError}</Alert>}
        </Card>
      ) : (
        <>
          <Card className={activeAttempt.status === "SUBMITTED" ? "border-emerald-200" : "border-brand-200"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {activeAttempt.status === "IN_PROGRESS" ? "Your attempt" : "Attempt submitted"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-brand-900">
                  {activeAttempt.status === "IN_PROGRESS"
                    ? "Saved answers are kept if you come back later; nothing is submitted until you submit."
                    : `Your answers are saved and this attempt was submitted${
                        activeAttempt.submittedAt
                          ? ` on ${new Date(activeAttempt.submittedAt).toLocaleString()}`
                          : ""
                      }. It can no longer be changed.${
                        result && result.scoredCriteria > 0
                          ? " Your marks are shown below."
                          : " No marks have been given yet; they will appear below once marking starts."
                      }`}
                </p>
                <p className="mt-1 text-xs font-medium text-brand-800">
                  {savedCount} of {tasks.length} tasks saved
                </p>
              </div>
              {activeAttempt.status === "IN_PROGRESS" &&
                (confirmingSubmit ? (
                  <Card className="w-full">
                    <Alert tone="warning" heading="Submit this attempt?">
                      Only saved answers are submitted, and answers cannot be changed afterwards.
                    </Alert>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        onClick={() => void submitAttempt()}
                        disabled={submitting}
                        variant="primary"
                      >
                        {submitting ? "Submitting…" : "Submit and lock"}
                      </Button>
                      <Button
                        onClick={() => setConfirmingSubmit(false)}
                        disabled={submitting}
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Button
                    onClick={() => setConfirmingSubmit(true)}
                    variant="secondary"
                  >
                    Submit attempt
                  </Button>
                ))}
            </div>
            {attemptError && <Alert tone="error" className="mt-3">{attemptError}</Alert>}
          </Card>

          {result && result.scoredCriteria > 0 && (
            <Card className="border-emerald-200 bg-emerald-50 tabular-nums">
              <h2 className="text-base font-semibold text-slate-900">Your result</h2>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {result.awarded}
                <span className="ml-1.5 text-base font-medium text-emerald-900">
                  out of {result.possible} marks
                </span>
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                {result.scoredCriteria} of {result.criterionCount} criteria marked
                {result.reviewedAt ? " — marking is complete." : " so far; more may follow."}
              </p>
              <ul className="mt-3 divide-y divide-emerald-200/70 text-sm">
                {tasks.map((task, index) => {
                  const taskResult = awardedForTask(task.id);
                  if (!taskResult) return null;
                  return (
                    <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="text-slate-800">
                        Task {index + 1}: {task.title ?? task.skillName}
                      </span>
                      <span className="text-xs font-medium text-emerald-900">
                        {taskResult.awarded} / {task.marks} marks · {taskResult.scored} of{" "}
                        {taskResult.count} criteria
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-emerald-900">
                Each task's rubric below shows what was awarded for each criterion.
              </p>
            </Card>
          )}

          {activeAttempt.status === "SUBMITTED" && followUps && followUps.questions.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Interview follow-up questions
                </h2>
                <span className="text-xs text-slate-500">
                  {followUps.answeredCount} of {followUps.total} answered
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Your recruiter prepares these from the criteria that were weakest or not yet marked,
                to guide a live conversation. You can answer them in writing here after submitting —
                it is optional, and it does not change your marks.
              </p>
              {followUpError && <Alert tone="error" className="mt-3">{followUpError}</Alert>}
              {followUps.questions.map((question) => (
                <div key={question.criterionId} className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">{question.question}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {question.taskTitle} · {question.criterion} · {question.reason}
                  </p>
                  <Textarea
                    rows={4}
                    value={followUpDrafts[question.criterionId] ?? ""}
                    onChange={(event) =>
                      setFollowUpDrafts((prev) => ({
                        ...prev,
                        [question.criterionId]: event.target.value,
                      }))
                    }
                    placeholder="Answer in a few sentences, if you would like to."
                    aria-label={question.question}
                    className="mt-2"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => void saveFollowUp(question.criterionId)}
                      disabled={followUpBusyId === question.criterionId}
                      variant="secondary"
                    >
                      {followUpBusyId === question.criterionId ? "Saving…" : "Save answer"}
                    </Button>
                    {question.answer.trim().length > 0 &&
                      (followUpDrafts[question.criterionId] ?? "") === question.answer && (
                        <span className="text-xs text-emerald-700">Saved</span>
                      )}
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label="Tasks" className="min-w-0 lg:self-start">
              <ol className="flex gap-2 overflow-x-auto p-1 lg:flex-col lg:overflow-visible">
                {tasks.map((task, index) => {
                  const isActive = index === safeIndex;
                  return (
                    <li key={task.id} className="shrink-0 lg:shrink">
                      <button
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-2 py-2 text-left lg:w-full lg:justify-start lg:rounded-control lg:px-3 ${
                          isActive
                            ? "border-brand-500 bg-white shadow-sm"
                            : "border-slate-200 bg-white/70 hover:border-slate-300"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isActive
                              ? "bg-brand-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="sr-only lg:not-sr-only lg:min-w-0">
                          <span className="block text-xs font-semibold text-slate-900">
                            Task {index + 1}
                          </span>
                          <span className="block wrap-break-word text-xs text-slate-500">
                            {task.skillName}
                          </span>
                        </span>
                        {savedTaskIds.has(task.id) && (
                          <span className="text-emerald-700 lg:ml-auto">
                            <CircleCheck aria-hidden="true" className="size-3.5" />
                            <span className="sr-only">Answer saved</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <Card className="min-w-0 wrap-break-word">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Task {safeIndex + 1} of {tasks.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
                {activeTask.title ?? `Task ${safeIndex + 1}`}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                  {TASK_TYPE_LABELS[activeTask.type] ?? activeTask.type}
                </span>
                <span>{activeTask.skillName}</span>
                <span>·</span>
                <span>{activeTask.marks} marks</span>
                <span>·</span>
                <span>{activeTask.timeMinutes} min</span>
              </div>

              <p className="mt-5 max-w-[65ch] whitespace-pre-line text-base leading-relaxed text-slate-800">
                {activeTask.prompt}
              </p>

              {Object.keys(activeTask.publicData).length > 0 && (
                <div className="mt-5">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Table2 className="h-3.5 w-3.5" aria-hidden />
                    Data for this task
                  </h3>
                  <div className="mt-2 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Supporting task data">
                    <DataPreview data={activeTask.publicData} />
                  </div>
                </div>
              )}

              {activeTask.rubric.length > 0 && (
                <details className="mt-5 rounded-xl border border-slate-200">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700">
                    How this task is scored
                    <span className="text-xs font-normal text-slate-500">
                      {activeTask.rubric.length} criteria · {activeTask.marks} marks
                      {awardedForTask(activeTask.id)
                        ? ` · you scored ${awardedForTask(activeTask.id)?.awarded}`
                        : ""}
                    </span>
                  </summary>
                  <div className="max-w-full overflow-x-auto border-t border-slate-100 px-4 py-3" tabIndex={0} role="region" aria-label="Scoring criteria">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="pb-1">
                            Criterion
                          </th>
                          <th scope="col" className="pb-1">
                            What is checked
                          </th>
                          <th scope="col" className="pb-1 text-right">
                            Marks
                          </th>
                          {result && (
                            <th scope="col" className="pb-1 pl-3 text-right">
                              Your marks
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeTask.rubric.map((criterion) => (
                          <tr key={criterion.position}>
                            <td className="py-2 pr-3 font-medium text-slate-800">
                              {criterion.name}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">{criterion.description}</td>
                            <td className="py-2 text-right text-slate-700">
                              {criterion.maxMarks}
                            </td>
                            {result && (
                              <td className="py-2 pl-3 text-right font-medium text-slate-900">
                                {awardedByCriterion.get(`${activeTask.id}:${criterion.position}`) ?? "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <div className="mt-6 border-t border-slate-100 pt-5">
                <label
                  htmlFor={`answer-${activeTask.id}`}
                  className="text-sm font-semibold text-slate-900"
                >
                  Your answer
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeAttempt.status === "IN_PROGRESS"
                    ? "Your text stays here while you switch tasks. Press Save answer to keep it."
                    : "This attempt is submitted, so the answer is read-only."}
                </p>
                {activeTask.type === "FILE_SUBMISSION" ? (
                  <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    File upload answers are not available yet.
                  </p>
                ) : (
                  <>
                    <Textarea
                      id={`answer-${activeTask.id}`}
                      rows={12}
                      value={drafts[activeTask.id] ?? ""}
                      readOnly={activeAttempt.status !== "IN_PROGRESS"}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [activeTask.id]: event.target.value }))
                      }
                      onPaste={(event) => {
                        if (!eventsEnabled) return;
                        eventQueueRef.current.push({
                          type: "PASTE",
                          taskId: activeTask.id,
                          metadata: {
                            length: event.clipboardData?.getData("text").length ?? 0,
                          },
                        });
                      }}
                      placeholder="Type your answer here"
                      className="mt-2 min-h-60"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {activeAttempt.status === "IN_PROGRESS" && (
                        <Button
                          onClick={() => void saveAnswer(activeTask.id)}
                          disabled={savingTaskId === activeTask.id}
                          variant="primary"
                        >
                          {savingTaskId === activeTask.id ? "Saving…" : "Save answer"}
                        </Button>
                      )}
                      {savedTaskId === activeTask.id && (
                        <span className="text-xs text-emerald-700">Saved</span>
                      )}
                      <span className="ml-auto text-xs text-slate-600">
                        {(drafts[activeTask.id] ?? "").length} characters
                      </span>
                    </div>
                    <Alert tone="info" className="mt-3">
                      Activity such as paste and tab-switching is recorded for the recruiter.
                    </Alert>
                  </>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  onClick={() => setActiveIndex(Math.max(0, safeIndex - 1))}
                  disabled={safeIndex === 0}
                  variant="secondary"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  {safeIndex + 1} / {tasks.length}
                </span>
                <Button
                  type="button"
                  onClick={() => setActiveIndex(Math.min(tasks.length - 1, safeIndex + 1))}
                  disabled={safeIndex >= tasks.length - 1}
                  variant="primary"
                >
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
