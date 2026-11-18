import { useMemo, useState } from "react";
import { AlertCircle, Save, X } from "lucide-react";
import { ApiError } from "../services/api";
import { updateDraft } from "../services/assessments";
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  type AiPolicy,
  type AssessmentDifficulty,
  type AssessmentLevel,
  type DraftUpdateRequest,
  type DraftVersion,
} from "../types/assessments";

const LEVELS: AssessmentLevel[] = ["INTERN", "FRESHER", "JUNIOR", "MID", "SENIOR"];
const DIFFICULTIES: AssessmentDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const compactFieldClass =
  "w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

type RubricRow = { name: string; description: string; maxMarks: number; privateGuidance: string };
type TaskRow = {
  id: string;
  title: string;
  prompt: string;
  marks: number;
  timeMinutes: number;
  rubric: RubricRow[];
};

function rubricRows(task: DraftVersion["tasks"][number]): RubricRow[] {
  return task.rubric.map((criterion) => ({
    name: criterion.name,
    description: criterion.description,
    maxMarks: criterion.maxMarks,
    privateGuidance: criterion.privateGuidance,
  }));
}

function rubricKey(rows: RubricRow[]): string {
  return JSON.stringify(rows.map((row) => [row.name, row.description, row.maxMarks, row.privateGuidance]));
}

/** Keeps number inputs usable: an empty box becomes the minimum instead of NaN. */
function toInt(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

type Props = {
  draft: DraftVersion;
  onSaved: (draft: DraftVersion) => void;
  onCancel: () => void;
};

export default function DraftEditForm({ draft, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [jobContext, setJobContext] = useState(draft.jobContext);
  const [candidateInstructions, setCandidateInstructions] = useState(draft.candidateInstructions);
  const [level, setLevel] = useState<AssessmentLevel>(draft.targetLevel);
  const [difficulty, setDifficulty] = useState<AssessmentDifficulty>(draft.difficulty);
  const [aiPolicy, setAiPolicy] = useState<AiPolicy>(draft.aiPolicy);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(draft.skills.map((skill) => [skill.skillSlug, skill.weight])),
  );
  const [tasks, setTasks] = useState<TaskRow[]>(() =>
    draft.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      marks: task.marks,
      timeMinutes: task.timeMinutes,
      rubric: rubricRows(task),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);

  const originalTasks = useMemo(
    () =>
      draft.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        marks: task.marks,
        timeMinutes: task.timeMinutes,
        rubric: rubricRows(task),
      })),
    [draft.tasks],
  );

  const marksTotal = tasks.reduce((sum, task) => sum + task.marks, 0);
  const minutesTotal = tasks.reduce((sum, task) => sum + task.timeMinutes, 0);
  const weightTotal = draft.skills.reduce((sum, skill) => sum + (weights[skill.skillSlug] ?? 0), 0);

  function patchTask(id: string, changes: Partial<TaskRow>) {
    setTasks((rows) => rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function patchCriterion(taskId: string, index: number, changes: Partial<RubricRow>) {
    setTasks((rows) =>
      rows.map((row) =>
        row.id === taskId
          ? { ...row, rubric: row.rubric.map((criterion, i) => (i === index ? { ...criterion, ...changes } : criterion)) }
          : row,
      ),
    );
  }

  function buildUpdate(): DraftUpdateRequest {
    const update: DraftUpdateRequest = {};

    if (title.trim() !== draft.title) update.title = title.trim();
    if (description.trim() !== draft.description) update.description = description.trim();
    if (jobContext.trim() !== draft.jobContext) update.jobContext = jobContext.trim();
    if (candidateInstructions.trim() !== draft.candidateInstructions) {
      update.candidateInstructions = candidateInstructions.trim();
    }
    if (level !== draft.targetLevel) update.targetLevel = level;
    if (difficulty !== draft.difficulty) update.difficulty = difficulty;
    if (aiPolicy !== draft.aiPolicy) update.aiPolicy = aiPolicy;

    // The skill set is fixed once generated; only weights are editable.
    if (draft.skills.some((skill) => weights[skill.skillSlug] !== skill.weight)) {
      update.skills = draft.skills.map((skill) => ({
        skillSlug: skill.skillSlug,
        weight: weights[skill.skillSlug] ?? skill.weight,
      }));
    }

    const tasksChanged = tasks.some((task) => {
      const original = originalTasks.find((row) => row.id === task.id);
      if (!original) return true;
      return (
        task.title.trim() !== original.title ||
        task.prompt.trim() !== original.prompt ||
        task.marks !== original.marks ||
        task.timeMinutes !== original.timeMinutes ||
        rubricKey(task.rubric) !== rubricKey(original.rubric)
      );
    });

    if (tasksChanged) {
      update.tasks = tasks.map((task) => {
        const original = originalTasks.find((row) => row.id === task.id);
        const rubricChanged = !original || rubricKey(task.rubric) !== rubricKey(original.rubric);
        return {
          id: task.id,
          title: task.title.trim(),
          prompt: task.prompt.trim(),
          marks: task.marks,
          timeMinutes: task.timeMinutes,
          // Leave the rubric out when it was not touched: the server rescales it to the new marks.
          ...(rubricChanged
            ? {
                rubric: task.rubric.map((criterion) => ({
                  name: criterion.name.trim(),
                  description: criterion.description.trim(),
                  maxMarks: criterion.maxMarks,
                  privateGuidance: criterion.privateGuidance.trim(),
                })),
              }
            : {}),
        };
      });
    }

    return update;
  }

  async function save() {
    setError(null);
    setIssues([]);
    const update = buildUpdate();
    if (Object.keys(update).length === 0) {
      setError("Nothing has changed yet.");
      return;
    }
    setSaving(true);
    try {
      const saved = await updateDraft(draft.assessmentId, draft.id, update);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.details);
      } else {
        setError(err instanceof Error ? err.message : "Could not save this draft.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
          {issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-8">
              {issues.map((issue, index) => (
                <li key={`${issue.field}-${index}`}>
                  <span className="font-medium">{issue.field}:</span> {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Assessment details</h2>
        <p className="text-sm text-slate-600">
          Marks must total 100, skill weights must total 100, and each rubric must add up to its task's marks. The
          server checks all of that when you save.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="draft-title" className="text-sm font-medium text-slate-800">
              Title
            </label>
            <input
              id="draft-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="draft-description" className="text-sm font-medium text-slate-800">
              Description
            </label>
            <textarea
              id="draft-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="draft-context" className="text-sm font-medium text-slate-800">
              Context shown to candidates
            </label>
            <textarea
              id="draft-context"
              rows={3}
              value={jobContext}
              onChange={(event) => setJobContext(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="draft-instructions" className="text-sm font-medium text-slate-800">
              Candidate instructions
            </label>
            <textarea
              id="draft-instructions"
              rows={4}
              value={candidateInstructions}
              onChange={(event) => setCandidateInstructions(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="draft-level" className="text-sm font-medium text-slate-800">
              Target level
            </label>
            <select
              id="draft-level"
              value={level}
              onChange={(event) => setLevel(event.target.value as AssessmentLevel)}
              className={fieldClass}
            >
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  {LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="draft-difficulty" className="text-sm font-medium text-slate-800">
              Difficulty
            </label>
            <select
              id="draft-difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as AssessmentDifficulty)}
              className={fieldClass}
            >
              {DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {DIFFICULTY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="draft-ai-policy" className="text-sm font-medium text-slate-800">
              AI assistants during the assessment
            </label>
            <select
              id="draft-ai-policy"
              value={aiPolicy}
              onChange={(event) => setAiPolicy(event.target.value as AiPolicy)}
              className={fieldClass}
            >
              <option value="NOT_ALLOWED">Not allowed</option>
              <option value="ALLOWED_DISCLOSED">Allowed if disclosed</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Skill weights</h2>
        <p className="text-sm text-slate-600">Skills cannot be added here — regenerate a draft to change the set.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="pb-2">Skill</th>
              <th scope="col" className="pb-2 text-right">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.skills.map((skill) => (
              <tr key={skill.skillSlug}>
                <td className="py-2 font-medium text-slate-900">{skill.name}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={weights[skill.skillSlug] ?? skill.weight}
                    onChange={(event) =>
                      setWeights((current) => ({
                        ...current,
                        [skill.skillSlug]: toInt(event.target.value, skill.weight, 1, 100),
                      }))
                    }
                    aria-label={`Weight for ${skill.name}`}
                    className={`${compactFieldClass} w-20 text-right`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 text-sm font-medium text-slate-700">Total</td>
              <td
                className={`pt-3 text-right text-sm font-semibold ${
                  weightTotal === 100 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {weightTotal}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {tasks.map((task, index) => {
        const original = draft.tasks[index];
        const rubricTotal = task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
        return (
          <section key={task.id} className="rounded-2xl border border-slate-200 bg-white p-6">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Task {index + 1} — {original?.skillName ?? task.title}
              </h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">{original?.type ?? task.id}</span>
            </header>

            <div className="mt-4 grid gap-4 sm:grid-cols-[3fr_1fr_1fr]">
              <div>
                <label htmlFor={`task-title-${task.id}`} className="text-sm font-medium text-slate-800">
                  Task title
                </label>
                <input
                  id={`task-title-${task.id}`}
                  value={task.title}
                  onChange={(event) => patchTask(task.id, { title: event.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor={`task-marks-${task.id}`} className="text-sm font-medium text-slate-800">
                  Marks
                </label>
                <input
                  id={`task-marks-${task.id}`}
                  type="number"
                  min={1}
                  max={100}
                  value={task.marks}
                  onChange={(event) => patchTask(task.id, { marks: toInt(event.target.value, task.marks, 1, 100) })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor={`task-minutes-${task.id}`} className="text-sm font-medium text-slate-800">
                  Minutes
                </label>
                <input
                  id={`task-minutes-${task.id}`}
                  type="number"
                  min={1}
                  max={240}
                  value={task.timeMinutes}
                  onChange={(event) =>
                    patchTask(task.id, { timeMinutes: toInt(event.target.value, task.timeMinutes, 1, 240) })
                  }
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor={`task-prompt-${task.id}`} className="text-sm font-medium text-slate-800">
                Prompt shown to the candidate
              </label>
              <textarea
                id={`task-prompt-${task.id}`}
                rows={5}
                value={task.prompt}
                onChange={(event) => patchTask(task.id, { prompt: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rubric</h3>
                <p className={`text-xs ${rubricTotal === task.marks ? "text-slate-500" : "text-rose-600"}`}>
                  {rubricTotal} of {task.marks} marks allocated
                </p>
              </div>
              <div className="mt-2 space-y-3">
                {task.rubric.map((criterion, criterionIndex) => (
                  <div key={criterionIndex} className="rounded-xl border border-slate-200 p-3">
                    <div className="grid gap-2 sm:grid-cols-[3fr_1fr]">
                      <div>
                        <label
                          htmlFor={`criterion-name-${task.id}-${criterionIndex}`}
                          className="text-xs text-slate-500"
                        >
                          Criterion
                        </label>
                        <input
                          id={`criterion-name-${task.id}-${criterionIndex}`}
                          value={criterion.name}
                          onChange={(event) =>
                            patchCriterion(task.id, criterionIndex, { name: event.target.value })
                          }
                          className={`mt-1 ${compactFieldClass}`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`criterion-marks-${task.id}-${criterionIndex}`}
                          className="text-xs text-slate-500"
                        >
                          Marks
                        </label>
                        <input
                          id={`criterion-marks-${task.id}-${criterionIndex}`}
                          type="number"
                          min={1}
                          max={100}
                          value={criterion.maxMarks}
                          onChange={(event) =>
                            patchCriterion(task.id, criterionIndex, {
                              maxMarks: toInt(event.target.value, criterion.maxMarks, 1, 100),
                            })
                          }
                          className={`mt-1 ${compactFieldClass}`}
                        />
                      </div>
                    </div>
                    <label
                      htmlFor={`criterion-description-${task.id}-${criterionIndex}`}
                      className="mt-2 block text-xs text-slate-500"
                    >
                      What is checked
                    </label>
                    <textarea
                      id={`criterion-description-${task.id}-${criterionIndex}`}
                      rows={2}
                      value={criterion.description}
                      onChange={(event) =>
                        patchCriterion(task.id, criterionIndex, { description: event.target.value })
                      }
                      className={`mt-1 ${compactFieldClass}`}
                    />
                    <label
                      htmlFor={`criterion-guidance-${task.id}-${criterionIndex}`}
                      className="mt-2 block text-xs text-slate-500"
                    >
                      Recruiter-only marking guidance
                    </label>
                    <textarea
                      id={`criterion-guidance-${task.id}-${criterionIndex}`}
                      rows={2}
                      value={criterion.privateGuidance}
                      onChange={(event) =>
                        patchCriterion(task.id, criterionIndex, { privateGuidance: event.target.value })
                      }
                      className={`mt-1 ${compactFieldClass}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className={`font-medium ${marksTotal === 100 ? "text-emerald-600" : "text-rose-600"}`}>
            {marksTotal} of 100 marks across {tasks.length} tasks
          </p>
          <p className="text-slate-600">Total time {minutesTotal} min — the sum of the task minutes above.</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save draft"}
          </button>
        </div>
      </section>
    </form>
  );
}
