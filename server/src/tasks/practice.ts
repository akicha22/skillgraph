/**
 * Daily practice tasks.
 *
 * A task is practice, not an evaluation: there are no marks, no rubric, no attempt and no
 * recruiter visibility. Each day the candidate gets three short drills drawn from their own skills,
 * and records a one-line reflection when they finish one.
 *
 * Generation is deterministic for a candidate and a day, so the same day always shows the same
 * drills even after a reload.
 */

import { buildPracticeDrill, type PracticeDrill } from "../assessments/scenarios";

export type PracticeSkill = { id: string; slug: string; name: string };

export type DailyTaskPlan = PracticeDrill & {
  position: number;
  skillId: string;
  skillName: string;
};

const TASKS_PER_DAY = 3;

/** Stable string hash (djb2) so a candidate's day does not reshuffle between requests. */
function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Local calendar day as YYYY-MM-DD; tasks are per day, not per UTC instant. */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/**
 * Builds today's drills from the candidate's skills. With no skills chosen there is nothing honest
 * to practise, so the list is empty and the page asks the candidate to pick skills first.
 */
export function buildDailyTasks(input: {
  candidateId: string;
  dateKey: string;
  skills: PracticeSkill[];
  jobTitle?: string;
  requirementsText?: string;
}): DailyTaskPlan[] {
  const skills = input.skills.filter((skill) => skill.id);
  if (skills.length === 0) return [];

  const offset = hash(`${input.candidateId}:${input.dateKey}`) % skills.length;
  const count = Math.min(TASKS_PER_DAY, skills.length);
  const plans: DailyTaskPlan[] = [];

  for (let i = 0; i < count; i++) {
    const skill = skills[(offset + i) % skills.length];
    const seed = hash(`${input.candidateId}:${input.dateKey}:${skill.id}`);
    const drill = buildPracticeDrill({
      seed,
      skillSlug: skill.slug,
      skillName: skill.name,
      jobTitle: input.jobTitle,
      requirementsText: input.requirementsText,
    });
    plans.push({ ...drill, position: i, skillId: skill.id, skillName: skill.name });
  }

  return plans;
}
