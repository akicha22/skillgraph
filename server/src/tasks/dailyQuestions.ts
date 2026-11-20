import { ALTERNATES, FORMATS, TYPED_BANKS } from "./typedBank";

export type DailyDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type DailyQuestionType = "NUMBER" | "SHORT_TEXT" | "SELF_REVIEW";

type BankId = keyof typeof TYPED_BANKS;

export function getDailyBankId(slug: string): BankId | undefined {
  const normalized = slug.trim().toLowerCase().replace(/[/_\s]+/g, "-");
  return Object.hasOwn(TYPED_BANKS, normalized) ? normalized as BankId : undefined;
}

export function buildDailyQuestion(bank: BankId, position: number, useAlternate = false) {
  const entry = (useAlternate ? ALTERNATES[bank][position] : undefined) ?? TYPED_BANKS[bank][position];
  const [concept, scenario, question, explanation, key] = entry;
  const type: DailyQuestionType = key ? "SHORT_TEXT" : "SELF_REVIEW";
  return { concept, scenario, question, explanation, format: FORMATS[position], type, accepted: key ? [key] : [] };
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
