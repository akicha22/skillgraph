import type { SkillFamily } from "../assessments/scenarios";
import { BANKS, EXTRA, TIER_RANGE } from "./dailyBank";

export type DailyDifficulty = keyof typeof TIER_RANGE;
export type DailyQuestionType = "NUMBER" | "SHORT_TEXT" | "SELF_REVIEW";

export function buildDailyQuestion(input: {
  seed: number;
  family: SkillFamily;
  skill: string;
  difficulty: DailyDifficulty;
  used: ReadonlySet<string>;
}) {
  const bankId = /video|film editing/i.test(input.skill) ? "VIDEO"
    : /excel|spreadsheet/i.test(input.skill) ? "EXCEL"
    : /\bsql\b/i.test(input.skill) ? "SQL"
    : /\bux\b|user experience/i.test(input.skill) ? "UX" : input.family;
  const tierIndex = input.difficulty === "BEGINNER" ? 0 : input.difficulty === "INTERMEDIATE" ? 1 : 2;
  const pool = [...BANKS[bankId].slice(...TIER_RANGE[input.difficulty]), EXTRA[bankId][tierIndex]]
    .filter(([id]) => !input.used.has(id));
  // A tier contains at least as many concepts as there are slots in that tier.
  const [concept, scenario, question, explanation, key] = pool[input.seed % pool.length];
  const type: DailyQuestionType = key ? "SHORT_TEXT" : "SELF_REVIEW";
  return { concept, scenario, question, explanation, type, accepted: key ? [key] : [] };
}

function firstNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[.!]+$/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Grades a submission on the server. Numbers tolerate rounding and currency formatting;
 * short text ignores case, extra spaces and a trailing full stop.
 */
export function gradeDailyAnswer(
  type: DailyQuestionType,
  accepted: string[],
  submitted: string,
): boolean {
  if (type === "SELF_REVIEW" || !submitted.trim() || accepted.length === 0) return false;

  if (type === "NUMBER") {
    const expected = firstNumber(accepted[0]);
    const actual = firstNumber(submitted);
    if (expected === null || actual === null) return false;
    // Answers are stored to two decimals, so allow only rounding-level difference.
    return Math.abs(actual - expected) <= 0.011;
  }

  const normalized = normalizeText(submitted);
  return accepted.some((candidate) => normalizeText(candidate) === normalized);
}
