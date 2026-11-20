import type { ReactNode } from "react";
import { Button } from "./ui/Button";
import { Alert, Card } from "./ui/Card";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { useMemo, useState } from "react";
import { Save, X } from "lucide-react";
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


type DraftIssue = { field: string; message: string };

function issueFor(issues: DraftIssue[], path: string) {
  return issues.filter((issue) => issue.field.replace(/\[(\d+)\]/g, ".$1") === path).map((issue) => issue.message).join(" ");
}

function DraftField({ id, label, error, children }: {
  id: string;
  label: string;
  error: string;
  children: (attributes: { id: string; "aria-invalid"?: true; "aria-describedby": string }) => ReactNode;
}) {
  return (
    <Field id={id} label={label}>
      {(attributes) => (
        <>
          {children({ ...attributes, "aria-invalid": error ? true : undefined, "aria-describedby": `${id}-validation` })}
          <p id={`${id}-validation`} aria-live="polite" tabIndex={error ? 0 : undefined} className="h-10 overflow-y-auto text-sm text-rose-700 wrap-break-word">{error}</p>
        </>
      )}
    </Field>
  );
}

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
      <div className="h-20 overflow-y-auto" tabIndex={error ? 0 : undefined}>
        {error && (
          <Alert tone="error" heading={error}>
            {issues.length > 0 && <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue, index) => <li key={`${issue.field}-${index}`}><span className="font-medium">{issue.field}:</span> {issue.message}</li>)}
            </ul>}
          </Alert>
        )}
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Assessment details</h2>
        <p className="text-sm text-slate-600">
          Marks must total 100, skill weights must total 100, and each rubric must add up to its task's marks. The
          server checks all of that when you save.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <DraftField id="draft-title" label="Title" error={issueFor(issues, "title")}>
              {(attributes) => <Input {...attributes}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />}
            </DraftField>
          </div>
          <div className="sm:col-span-2">
            <DraftField id="draft-description" label="Description" error={issueFor(issues, "description")}>
              {(attributes) => <Textarea {...attributes}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />}
            </DraftField>
          </div>
          <div className="sm:col-span-2">
            <DraftField id="draft-context" label="Context shown to candidates" error={issueFor(issues, "jobContext")}>
              {(attributes) => <Textarea {...attributes}
              rows={3}
              value={jobContext}
              onChange={(event) => setJobContext(event.target.value)}
            />}
            </DraftField>
          </div>
          <div className="sm:col-span-2">
            <DraftField id="draft-instructions" label="Candidate instructions" error={issueFor(issues, "candidateInstructions")}>
              {(attributes) => <Textarea {...attributes}
              rows={4}
              value={candidateInstructions}
              onChange={(event) => setCandidateInstructions(event.target.value)}
            />}
            </DraftField>
          </div>
          <div>
            <DraftField id="draft-level" label="Target level" error={issueFor(issues, "targetLevel")}>
              {(attributes) => <Select {...attributes}
              value={level}
              onChange={(event) => setLevel(event.target.value as AssessmentLevel)}
            >
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  {LEVEL_LABELS[value]}
                </option>
              ))}
            </Select>}
            </DraftField>
          </div>
          <div>
            <DraftField id="draft-difficulty" label="Difficulty" error={issueFor(issues, "difficulty")}>
              {(attributes) => <Select {...attributes}
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as AssessmentDifficulty)}
            >
              {DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {DIFFICULTY_LABELS[value]}
                </option>
              ))}
            </Select>}
            </DraftField>
          </div>
          <div className="sm:col-span-2">
            <DraftField id="draft-ai-policy" label="AI assistants during the assessment" error={issueFor(issues, "aiPolicy")}>
              {(attributes) => <Select {...attributes}
              value={aiPolicy}
              onChange={(event) => setAiPolicy(event.target.value as AiPolicy)}
            >
              <option value="NOT_ALLOWED">Not allowed</option>
              <option value="ALLOWED_DISCLOSED">Allowed if disclosed</option>
            </Select>}
            </DraftField>
          </div>
        </div>
      </Card>

      <Card>
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
            {draft.skills.map((skill, skillIndex) => (
              <tr key={skill.skillSlug}>
                <td className="py-2 font-medium text-slate-900">{skill.name}</td>
                <td className="py-2 text-right">
                  <DraftField id={`draft-weight-${skill.skillSlug}`} label={`Weight for ${skill.name}`} error={issueFor(issues, `skills.${skillIndex}.weight`)}>
                    {(attributes) => <Input {...attributes}
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
                    className="w-24 text-right"
                  />}
                  </DraftField>
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
      </Card>

      {tasks.map((task, index) => {
        const original = draft.tasks[index];
        const rubricTotal = task.rubric.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
        return (
          <Card key={task.id}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Task {index + 1} — {original?.skillName ?? task.title}
              </h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">{original?.type ?? task.id}</span>
            </header>

            <div className="mt-4 grid gap-4 sm:grid-cols-[3fr_1fr_1fr]">
              <div>
                <DraftField id={`task-title-${task.id}`} label="Task title" error={issueFor(issues, `tasks.${index}.title`)}>
              {(attributes) => <Input {...attributes}
                  value={task.title}
                  onChange={(event) => patchTask(task.id, { title: event.target.value })}
                />}
            </DraftField>
              </div>
              <div>
                <DraftField id={`task-marks-${task.id}`} label="Marks" error={issueFor(issues, `tasks.${index}.marks`)}>
              {(attributes) => <Input {...attributes}
                  type="number"
                  min={1}
                  max={100}
                  value={task.marks}
                  onChange={(event) => patchTask(task.id, { marks: toInt(event.target.value, task.marks, 1, 100) })}
                />}
            </DraftField>
              </div>
              <div>
                <DraftField id={`task-minutes-${task.id}`} label="Minutes" error={issueFor(issues, `tasks.${index}.timeMinutes`)}>
              {(attributes) => <Input {...attributes}
                  type="number"
                  min={1}
                  max={240}
                  value={task.timeMinutes}
                  onChange={(event) =>
                    patchTask(task.id, { timeMinutes: toInt(event.target.value, task.timeMinutes, 1, 240) })
                  }
                />}
            </DraftField>
              </div>
            </div>

            <div className="mt-4">
              <DraftField id={`task-prompt-${task.id}`} label="Prompt shown to the candidate" error={issueFor(issues, `tasks.${index}.prompt`)}>
              {(attributes) => <Textarea {...attributes}
                rows={5}
                value={task.prompt}
                onChange={(event) => patchTask(task.id, { prompt: event.target.value })}
              />}
            </DraftField>
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
                        <DraftField id={`criterion-name-${task.id}-${criterionIndex}`} label="Criterion" error={issueFor(issues, `tasks.${index}.rubric.${criterionIndex}.name`)}>
              {(attributes) => <Input {...attributes}
                          value={criterion.name}
                          onChange={(event) =>
                            patchCriterion(task.id, criterionIndex, { name: event.target.value })
                          }
                        />}
            </DraftField>
                      </div>
                      <div>
                        <DraftField id={`criterion-marks-${task.id}-${criterionIndex}`} label="Marks" error={issueFor(issues, `tasks.${index}.rubric.${criterionIndex}.maxMarks`)}>
              {(attributes) => <Input {...attributes}
                          type="number"
                          min={1}
                          max={100}
                          value={criterion.maxMarks}
                          onChange={(event) =>
                            patchCriterion(task.id, criterionIndex, {
                              maxMarks: toInt(event.target.value, criterion.maxMarks, 1, 100),
                            })
                          }
                        />}
            </DraftField>
                      </div>
                    </div>
                    <DraftField id={`criterion-description-${task.id}-${criterionIndex}`} label="What is checked" error={issueFor(issues, `tasks.${index}.rubric.${criterionIndex}.description`)}>
              {(attributes) => <Textarea {...attributes}
                      rows={2}
                      value={criterion.description}
                      onChange={(event) =>
                        patchCriterion(task.id, criterionIndex, { description: event.target.value })
                      }
                    />}
            </DraftField>
                    <DraftField id={`criterion-guidance-${task.id}-${criterionIndex}`} label="Recruiter-only marking guidance" error={issueFor(issues, `tasks.${index}.rubric.${criterionIndex}.privateGuidance`)}>
              {(attributes) => <Textarea {...attributes}
                      rows={2}
                      value={criterion.privateGuidance}
                      onChange={(event) =>
                        patchCriterion(task.id, criterionIndex, { privateGuidance: event.target.value })
                      }
                    />}
            </DraftField>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className={`font-medium ${marksTotal === 100 ? "text-emerald-600" : "text-rose-600"}`}>
            {marksTotal} of 100 marks across {tasks.length} tasks
          </p>
          <p className="text-slate-600">Total time {minutesTotal} min — the sum of the task minutes above.</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            onClick={onCancel}
            disabled={saving}
            variant="secondary"
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            variant="primary"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
