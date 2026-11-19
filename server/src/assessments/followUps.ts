/**
 * Interview follow-up questions derived from a submitted attempt.
 *
 * One question per task, taken from the weakest or still-unmarked criterion by a fixed rule. No AI
 * is involved and no outcome is decided here: the recruiter uses these to prepare a live interview,
 * and the candidate answers them in writing after submitting.
 *
 * Shared by the recruiter's submission view and the candidate's post-submission form so both see
 * exactly the same questions.
 */

export type FollowUpTaskInput = {
  id: string;
  title: string;
  rubric: { id: string; name: string; maxMarks: number; score: number | null }[];
};

export type FollowUpQuestion = {
  criterionId: string;
  criterion: string;
  taskId: string;
  taskTitle: string;
  score: number | null;
  maxMarks: number;
  reason: string;
  question: string;
};

export function buildFollowUpQuestions(
  tasks: FollowUpTaskInput[],
  limit = 3,
): FollowUpQuestion[] {
  const ranked = tasks
    .flatMap((task) =>
      task.rubric.map((criterion) => ({
        criterionId: criterion.id,
        criterion: criterion.name,
        taskId: task.id,
        taskTitle: task.title,
        score: criterion.score,
        maxMarks: criterion.maxMarks,
        ratio: criterion.score === null ? 0 : criterion.score / Math.max(1, criterion.maxMarks),
        question: `On "${task.title}", walk me through how you handled "${criterion.name}". What did you check, and what would you do differently?`,
      })),
    )
    .sort((a, b) => a.ratio - b.ratio);

  const questions: FollowUpQuestion[] = [];
  const questioned = new Set<string>();
  for (const row of ranked) {
    if (questions.length >= limit) break;
    if (questioned.has(row.taskId)) continue;
    questioned.add(row.taskId);
    questions.push({
      criterionId: row.criterionId,
      criterion: row.criterion,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      score: row.score,
      maxMarks: row.maxMarks,
      reason: row.score === null ? "Not marked yet" : `Scored ${row.score} of ${row.maxMarks}`,
      question: row.question,
    });
  }
  return questions;
}
