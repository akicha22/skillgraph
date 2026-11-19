import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Scale, Sparkles, Wand2 } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import SkillPicker from "./SkillPicker";
import { useSkillLibrary } from "../hooks/useSkillLibrary";
import { clarifyAssessment, generateAssessment, parseRequirements } from "../services/assessments";
import { ApiError } from "../services/api";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  type AiPolicy,
  type ClarificationAnswer,
  type ClarificationQuestion,
  type AssessmentDifficulty,
  type AssessmentLevel,
  type GenerateRequest,
  type ParsedRequirements,
  type TargetSkillInput,
} from "../types/assessments";

const STEPS = ["Role brief", "Skills and weights", "Assessment settings", "Review"];

const LEVELS: AssessmentLevel[] = ["INTERN", "FRESHER", "JUNIOR", "MID", "SENIOR"];
const DIFFICULTIES: AssessmentDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

type SelectedSkill = { skillSlug: string; name: string; weight: number; source: TargetSkillInput["source"] };

const MAX_SKILLS = 8;

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

function distributeWeights(rows: SelectedSkill[]): SelectedSkill[] {
  if (rows.length === 0) return rows;
  const base = Math.floor(100 / rows.length);
  const remainder = 100 - base * rows.length;
  return rows.map((row, i) => ({ ...row, weight: base + (i < remainder ? 1 : 0) }));
}

function selectionFromParsed(result: ParsedRequirements): SelectedSkill[] {
  const seen = new Set<string>();
  const rows: SelectedSkill[] = [];
  for (const skill of result.skills) {
    if (seen.has(skill.slug) || rows.length >= MAX_SKILLS) continue;
    seen.add(skill.slug);
    rows.push({ skillSlug: skill.slug, name: skill.name, weight: 1, source: "REQUESTED" });
  }
  for (const skill of result.suggestedSkills) {
    if (seen.has(skill.slug) || rows.length >= MAX_SKILLS) continue;
    seen.add(skill.slug);
    rows.push({ skillSlug: skill.slug, name: skill.name, weight: 1, source: "SUGGESTED_APPROVED" });
  }
  return distributeWeights(rows);
}

export default function AssessmentWizard() {
  const navigate = useNavigate();
  const { domains, loading: libraryLoading, error: libraryError } = useSkillLibrary();

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 — the brief
  const [requirementsText, setRequirementsText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  // Step 2 — skills
  const [parsed, setParsed] = useState<ParsedRequirements | null>(null);
  const [selected, setSelected] = useState<SelectedSkill[]>([]);

  // Clarification: asked only when the brief is missing something the tasks need.
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarifyDrafts, setClarifyDrafts] = useState<Record<string, string>>({});
  const [clarifications, setClarifications] = useState<ClarificationAnswer[]>([]);

  // Step 3 — settings
  const [level, setLevel] = useState<AssessmentLevel>("JUNIOR");
  const [difficulty, setDifficulty] = useState<AssessmentDifficulty>("INTERMEDIATE");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [taskCount, setTaskCount] = useState(3);
  const [aiPolicy, setAiPolicy] = useState<AiPolicy>("NOT_ALLOWED");

  const libraryBySlug = useMemo(() => {
    const map = new Map<string, { id: string; slug: string; name: string }>();
    for (const domain of domains) for (const skill of domain.skills) map.set(skill.slug, skill);
    return map;
  }, [domains]);

  const slugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const domain of domains) for (const skill of domain.skills) map.set(skill.id, skill.slug);
    return map;
  }, [domains]);

  const selectedIds = useMemo(
    () => selected.map((skill) => libraryBySlug.get(skill.skillSlug)?.id).filter((id): id is string => Boolean(id)),
    [selected, libraryBySlug],
  );

  const weightSum = selected.reduce((sum, skill) => sum + skill.weight, 0);
  const skillsValid = selected.length > 0 && selected.length <= MAX_SKILLS && weightSum === 100;
  const taskCountValid = taskCount >= selected.length && taskCount <= 8;

  function setWeight(slug: string, value: number) {
    const weight = Number.isFinite(value) ? Math.min(100, Math.max(1, Math.round(value))) : 1;
    setSelected((rows) => rows.map((row) => (row.skillSlug === slug ? { ...row, weight } : row)));
  }

  function syncFromPicker(ids: string[]) {
    const wanted = new Set(
      ids.map((id) => slugById.get(id)).filter((slug): slug is string => typeof slug === "string"),
    );
    setSelected((rows) => {
      const kept = rows.filter((row) => wanted.has(row.skillSlug));
      const added = [...wanted]
        .filter((slug) => !kept.some((row) => row.skillSlug === slug))
        .map((slug) => ({
          skillSlug: slug,
          name: libraryBySlug.get(slug)?.name ?? slug,
          weight: 10,
          source: "REQUESTED" as const,
        }));
      return [...kept, ...added].slice(0, MAX_SKILLS);
    });
  }

  async function readBrief() {
    setError(null);
    if (requirementsText.trim().length < 10) {
      setError("Describe the role in at least a sentence so we can read the skills from it.");
      return;
    }
    if (companyName.trim().length === 0) {
      setError("Company name is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await parseRequirements(requirementsText.trim());
      const rows = selectionFromParsed(result);
      setParsed(result);
      setSelected(rows);
      if (result.targetLevel) setLevel(result.targetLevel);
      if (result.difficulty) setDifficulty(result.difficulty);
      if (result.durationMinutes) setDurationMinutes(result.durationMinutes);
      if (result.taskCount) setTaskCount(Math.max(result.taskCount, rows.length));
      if (result.jobTitle && jobTitle.trim().length === 0) setJobTitle(result.jobTitle);

      // Ask only for what the brief leaves out. A failed ask never blocks the wizard: the
      // recruiter simply continues with the brief they wrote.
      const questions = await clarifyAssessment({
        requirementsText: requirementsText.trim(),
        jobTitle: jobTitle.trim() || result.jobTitle || undefined,
        targetLevel: result.targetLevel ?? undefined,
        skillSlugs: rows.map((row) => row.skillSlug),
      })
        .then((response) => response.questions)
        .catch(() => [] as ClarificationQuestion[]);

      setClarifications([]);
      setClarifyDrafts({});
      if (questions.length > 0) {
        setClarifyQuestions(questions);
      } else {
        setStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the role description.");
    } finally {
      setBusy(false);
    }
  }

  /** Closes the clarification step and moves on, carrying whatever the recruiter answered. */
  function continuePastClarifications(skip = false) {
    const answers: ClarificationAnswer[] = skip
      ? []
      : clarifyQuestions
          .map((question) => ({
            question: question.question,
            answer: (clarifyDrafts[question.id] ?? "").trim(),
          }))
          .filter((row) => row.answer.length > 0);
    setClarifications(answers);
    setClarifyQuestions([]);
    setStep(2);
  }

  function goToSettings() {
    setError(null);
    if (!skillsValid) {
      setError(`Skill weights must add up to 100 (currently ${weightSum}).`);
      return;
    }
    setTaskCount((current) => Math.max(current, selected.length));
    setStep(3);
  }

  async function submit() {
    setError(null);
    if (!skillsValid) {
      setError(`Skill weights must add up to 100 (currently ${weightSum}).`);
      setStep(2);
      return;
    }
    if (!taskCountValid) {
      setError(`Task count must be between ${selected.length} and 8.`);
      setStep(3);
      return;
    }
    const trimmedTitle = jobTitle.trim();
    const payload: GenerateRequest = {
      requirementsText: requirementsText.trim(),
      companyName: companyName.trim(),
      ...(trimmedTitle ? { jobTitle: trimmedTitle } : {}),
      targetLevel: level,
      difficulty,
      durationMinutes,
      taskCount,
      aiPolicy,
      targetSkills: selected.map((skill) => ({
        skillSlug: skill.skillSlug,
        weight: skill.weight,
        subskills: [],
        source: skill.source,
      })),
      ...(clarifications.length > 0 ? { clarifications } : {}),
    };

    setBusy(true);
    try {
      const result = await generateAssessment(payload);
      navigate(`/recruiter/assessments/${result.id}/versions/${result.versionId}`);
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        setError(err.details.map((detail) => detail.message).join(" "));
      } else {
        setError(err instanceof Error ? err.message : "Generation failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">New assessment</h1>
        <p className="mt-1 text-slate-600">
          Describe the role, confirm the skills, and SkillGraph builds a draft with computed tasks, marks and rubrics.
        </p>

        <ol className="mt-5 flex flex-wrap gap-2 text-sm">
          {STEPS.map((label, i) => {
            const number = i + 1;
            const state = number === step ? "current" : number < step ? "done" : "todo";
            return (
              <li
                key={label}
                aria-current={state === "current" ? "step" : undefined}
                className={`rounded-full px-3 py-1 ${
                  state === "current"
                    ? "bg-indigo-600 text-white"
                    : state === "done"
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {number}. {label}
              </li>
            );
          })}
        </ol>
      </section>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {step === 1 && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <label htmlFor="brief" className="text-sm font-medium text-slate-800">
              What are you hiring for?
            </label>
            <textarea
              id="brief"
              rows={6}
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              placeholder="We need a junior operations associate who can analyse sales data in Excel, handle client emails and negotiate basic supplier terms. Around 45 minutes, three tasks."
              className={`mt-1 ${fieldClass}`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Skills, duration and task count are read from this text. You can change everything in the next steps.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company" className="text-sm font-medium text-slate-800">
                Company <span className="text-rose-600">*</span>
              </label>
              <input
                id="company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Northline Trading"
                className={`mt-1 ${fieldClass}`}
              />
            </div>
            <div>
              <label htmlFor="jobTitle" className="text-sm font-medium text-slate-800">
                Job title <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Read from the brief if left empty"
                className={`mt-1 ${fieldClass}`}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void readBrief()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {busy ? "Reading the brief…" : "Read the brief"}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Skills and weights</h2>
              <p className="text-sm text-slate-600">
                Weights decide how much of the 100 marks each skill carries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected((rows) => distributeWeights(rows))}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Scale className="h-4 w-4" aria-hidden />
              Distribute evenly
            </button>
          </div>

          {parsed && parsed.notes.length > 0 && (
            <ul className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {parsed.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

          {selected.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No skills selected yet. Pick the skills this role is assessed on below.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="pb-2">Skill</th>
                  <th scope="col" className="pb-2">Source</th>
                  <th scope="col" className="pb-2 text-right">Weight</th>
                  <th scope="col" className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.map((skill) => (
                  <tr key={skill.skillSlug}>
                    <td className="py-2 font-medium text-slate-900">{skill.name}</td>
                    <td className="py-2 text-slate-500">
                      {skill.source === "SUGGESTED_APPROVED" ? "Suggested" : "Requested"}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={skill.weight}
                        onChange={(e) => setWeight(skill.skillSlug, Number(e.target.value))}
                        aria-label={`Weight for ${skill.name}`}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected((rows) => rows.filter((row) => row.skillSlug !== skill.skillSlug))}
                        className="text-sm font-medium text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-sm font-medium text-slate-700" colSpan={2}>
                    Total
                  </td>
                  <td className={`pt-3 text-right text-sm font-semibold ${weightSum === 100 ? "text-emerald-600" : "text-rose-600"}`}>
                    {weightSum}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add skills</h3>
            <p className="mt-1 text-sm text-slate-600">
              {libraryLoading ? "Loading the skill library…" : `${selected.length} of ${MAX_SKILLS} selected`}
            </p>
            {libraryError && <p className="mt-2 text-sm text-rose-600">{libraryError}</p>}
            {!libraryLoading && !libraryError && (
              <div className="mt-3">
                <SkillPicker
                  domains={domains}
                  selectedIds={selectedIds}
                  onChange={syncFromPicker}
                  max={MAX_SKILLS}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
            <button
              type="button"
              onClick={goToSettings}
              disabled={!skillsValid}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assessment settings</h2>
            <p className="text-sm text-slate-600">
              Time is split across tasks by the generator; marks always total 100.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="level" className="text-sm font-medium text-slate-800">
                Target level
              </label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as AssessmentLevel)}
                className={`mt-1 ${fieldClass}`}
              >
                {LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {LEVEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="difficulty" className="text-sm font-medium text-slate-800">
                Difficulty
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as AssessmentDifficulty)}
                className={`mt-1 ${fieldClass}`}
              >
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {DIFFICULTY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="duration" className="text-sm font-medium text-slate-800">
                Total minutes
              </label>
              <input
                id="duration"
                type="number"
                min={10}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={`mt-1 ${fieldClass}`}
              />
            </div>
            <div>
              <label htmlFor="taskCount" className="text-sm font-medium text-slate-800">
                Number of tasks
              </label>
              <input
                id="taskCount"
                type="number"
                min={selected.length}
                max={8}
                value={taskCount}
                onChange={(e) => setTaskCount(Number(e.target.value))}
                className={`mt-1 ${fieldClass}`}
              />
              <p className="mt-1 text-xs text-slate-500">At least one task per skill ({selected.length}).</p>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">AI assistants during the assessment</legend>
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="aiPolicy"
                  checked={aiPolicy === "NOT_ALLOWED"}
                  onChange={() => setAiPolicy("NOT_ALLOWED")}
                  className="mt-1"
                />
                <span>
                  Not allowed — candidates must work without AI tools.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="aiPolicy"
                  checked={aiPolicy === "ALLOWED_DISCLOSED"}
                  onChange={() => setAiPolicy("ALLOWED_DISCLOSED")}
                  className="mt-1"
                />
                <span>
                  Allowed if disclosed — candidates may use AI but must say how.
                </span>
              </label>
            </div>
          </fieldset>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              disabled={!taskCountValid}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Review</h2>
            <p className="text-sm text-slate-600">Generating creates version 1 of a draft you can still change.</p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Company</dt>
              <dd className="font-medium text-slate-900">{companyName.trim()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Job title</dt>
              <dd className="font-medium text-slate-900">{jobTitle.trim() || "Read from the brief"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Level and difficulty</dt>
              <dd className="font-medium text-slate-900">
                {LEVEL_LABELS[level]} · {DIFFICULTY_LABELS[difficulty]}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Length</dt>
              <dd className="font-medium text-slate-900">
                {taskCount} tasks · {durationMinutes} minutes
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Skills</dt>
              <dd className="font-medium text-slate-900">
                {selected.map((skill) => `${skill.name} (${skill.weight})`).join(" · ")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">AI policy</dt>
              <dd className="font-medium text-slate-900">
                {aiPolicy === "NOT_ALLOWED" ? "AI not allowed" : "AI allowed if disclosed"}
              </dd>
            </div>
            {clarifications.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-slate-500">Extra context you gave</dt>
                <dd className="mt-1 space-y-1 text-slate-800">
                  {clarifications.map((row) => (
                    <p key={row.question}>
                      <span className="text-slate-500">{row.question}</span> {row.answer}
                    </p>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              {busy ? "Generating…" : "Generate assessment"}
            </button>
          </div>
        </section>
      )}
      {clarifyQuestions.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clarify-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="clarify-title" className="text-lg font-semibold text-slate-900">
              A few details will make this assessment sharper
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              These are missing from your brief. Answer what you can — the tasks use your answers to
              build a concrete case instead of a generic one. Nothing here is required.
            </p>
            <div className="mt-4 max-h-[55vh] space-y-4 overflow-auto pr-1">
              {clarifyQuestions.map((question) => (
                <label key={question.id} className="block text-sm">
                  <span className="font-medium text-slate-900">{question.question}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{question.why}</span>
                  <input
                    value={clarifyDrafts[question.id] ?? ""}
                    onChange={(event) =>
                      setClarifyDrafts((prev) => ({ ...prev, [question.id]: event.target.value }))
                    }
                    maxLength={500}
                    placeholder={question.placeholder}
                    className={`mt-1 ${fieldClass}`}
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => continuePastClarifications(true)}
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Skip these
              </button>
              <button
                type="button"
                onClick={() => continuePastClarifications(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
