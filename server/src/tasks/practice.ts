/** Daily practice tasks.

 * A task is practice, not an evaluation: there are no marks, no rubric, no attempt and no
 * recruiter visibility. Each day the candidate gets ten short drills drawn from their own skills,
 * ordered from easy (BEGINNER) to hard (ADVANCED), and records a one-line reflection when they finish one.

 * Generation is deterministic for a candidate and a day, so the same day always shows the same
 * drills even after a reload.

 * At least 10 tasks per day are generated, as many as the candidate's skills allow.
 * If the candidate has fewer than 10 skills, tasks cycle through the skills until 10 are produced.
 */

import { buildPracticeDrill, type PracticeDrill } from "../assessments/scenarios";

export type PracticeSkill = { id: string; slug: string; name: string };

/** Mapping of difficulty to points awarded for completion. */
export const DIFFICULTY_POINTS: Record<"BEGINNER" | "INTERMEDIATE" | "ADVANCED", number> = {
  BEGINNER: 5,
  INTERMEDIATE: 10,
  ADVANCED: 15,
};

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

/** Builds today's drills from the candidate's skills.

 * With no skills chosen there is nothing honest to practise, so the list is empty and the page
 * asks the candidate to pick skills first.

 * Ten tasks are generated, ordered from easy to hard. When the candidate has fewer than 10 skills,
 * the skills are cycled through in order to fill all 10 positions.
 */
export type DailyTaskPlan = PracticeDrill & {
  position: number;
  skillId: string;
  skillName: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  points: number;
}

/** Builds today's drills from the candidate's skills. With no skills chosen there is nothing honest
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

  // Determine difficulty order: BEGINNER → INTERMEDIATE → ADVANCED
  // We assign difficulties to task positions 0..9 cyclically based on skill count.
  const tasks: DailyTaskPlan[] = [];

  for (let pos = 0; pos < 10; pos++) {
    // Cycle through skills: skill at index (offset + pos) % skills.length
    const skillIndex = (hash(`${input.candidateId}:${input.dateKey}`) + pos) % skills.length;
    const skill = skills[skillIndex];

    // Difficulty progresses: first ~3 tasks BEGINNER, next ~3 INTERMEDIATE, last ~3 ADVANCED
    let difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    if (pos < 3) difficulty = "BEGINNER";
    else if (pos < 6) difficulty = "INTERMEDIATE";
    else difficulty = "ADVANCED";

    const seed = hash(`${input.candidateId}:${input.dateKey}:${skill.id}:${pos}`);
    const drill = buildPracticeDrill({
      seed,
      skillSlug: skill.slug,
      skillName: skill.name,
      jobTitle: input.jobTitle,
      requirementsText: input.requirementsText,
    });

    tasks.push({
      ...drill,
      position: pos,
      skillId: skill.id,
      skillName: skill.name,
      difficulty,
      points: DIFFICULTY_POINTS[difficulty],
    });
  }

  return tasks;
}