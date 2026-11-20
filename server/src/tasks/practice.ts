/** Daily workplace practice, seeded per candidate and day. Published tasks are persisted
 * by the route. Objective tasks are graded; practical outputs are reviewed by the candidate.
 */
import { detectFamily, type PracticeDrill } from "../assessments/scenarios";
import { buildDailyQuestion, getDailyBankId, type DailyDifficulty, type DailyQuestionType } from "./dailyQuestions";

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

export type DailyTaskPlan = PracticeDrill & {
  concept: string;
  position: number;
  skillId: string;
  skillName: string;
  difficulty: DailyDifficulty;
  points: number;
  question: string;
  questionType: DailyQuestionType;
  /** Private answer key; stored with the task and only returned after a submission. */
  acceptedAnswers: string[];
  explanation: string;
}

/** Cycle through selected skills with an exact bank match. Never relabel a fallback
 * question as practice for an unsupported skill.
 */
export function buildDailyTasks(input: {
  candidateId: string;
  dateKey: string;
  skills: PracticeSkill[];
  jobTitle?: string;
  requirementsText?: string;
}): DailyTaskPlan[] {
  const skills = input.skills.flatMap((skill) => {
    const bank = getDailyBankId(skill.slug);
    return skill.id && bank ? [{ skill, bank }] : [];
  });
  if (skills.length === 0) return [];

  const tasks: DailyTaskPlan[] = [];
  const useAlternate = Number(input.dateKey.slice(-2)) % 2 === 0;
  const offset = hash(`${input.candidateId}:${input.dateKey}`) % skills.length;
  for (let pos = 0; pos < 10; pos++) {
    const { skill, bank } = skills[(offset + pos) % skills.length];
    const difficulty: DailyDifficulty = pos < 3 ? "BEGINNER" : pos < 7 ? "INTERMEDIATE" : "ADVANCED";
    const family = detectFamily(skill.slug, skill.name);
    const question = buildDailyQuestion(bank, pos, useAlternate);

    tasks.push({
      family,
      title: `${skill.name} · ${question.format}`,
      concept: question.concept,
      scenario: question.scenario,
      steps: [],
      minutes: pos < 3 ? 1 : pos < 7 ? 2 : 3,
      position: pos,
      skillId: skill.id,
      skillName: skill.name,
      difficulty,
      points: question.type === "SELF_REVIEW" ? 0 : DIFFICULTY_POINTS[difficulty],
      question: question.question,
      questionType: question.type,
      acceptedAnswers: question.accepted,
      explanation: question.explanation,
    });
  }

  return tasks;
}