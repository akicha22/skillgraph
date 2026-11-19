/**
 * Clarifying questions for assessment generation.
 *
 * Generation can only be as specific as the brief. When a brief leaves out something the scenario
 * genuinely needs — the product, the market, whether the role manages people, the scale, the tools —
 * the recruiter is asked, rather than the assessment silently filling the gap with a generic answer.
 *
 * The rules are deliberate: at most three questions, never about things the brief already says, and
 * never for a brief that already carries enough detail to build a concrete case.
 */

import { detectFamily, type SkillFamily } from "./scenarios";

export type ClarificationQuestion = {
  id: "product" | "market" | "team" | "scale" | "tools";
  question: string;
  why: string;
  placeholder: string;
};

type ClarificationInput = {
  requirementsText: string;
  jobTitle?: string;
  targetLevel?: string;
  skillSlugs: string[];
  skillNames?: string[];
};

const PRODUCT_WORDS =
  /software|saas|platform|apparel|clothing|fashion|fmcg|consumer goods|industrial|equipment|machine|logistic|freight|insurance|policy|course|training|pharma|health|bank|loan|credit|hotel|hospitality|travel|property|retail|store|product|service/;
const MARKET_WORDS =
  /\bb2b\b|\bb2c\b|\bd2c\b|enterprise|corporate|consumer|smb\b|sme\b|small business|export|international|government|public sector|tender|mid-market|regional/;
const TEAM_WORDS = /team|manage|manag|lead|report|supervis|headcount|hire|individual contributor/;
const SCALE_WORDS = /(₹|rs\.?|inr|%|\blakh\b|\bcrore\b|\d+\s*(?:k|thousand|users|orders|customers|units|people|members))/i;
const TOOL_WORDS =
  /excel|sql|python|javascript|typescript|tableau|power bi|looker|salesforce|hubspot|jira|figma|autocad|git|aws|azure|gcp|sap|tally|zoho|notion|sheets/;

const FAMILY_ORDER: Record<SkillFamily, ClarificationQuestion["id"][]> = {
  SALES: ["product", "market", "scale", "team"],
  SERVICE: ["product", "market", "team", "scale"],
  OPERATIONS: ["scale", "team", "product", "tools"],
  DATA: ["tools", "scale", "product", "team"],
  PEOPLE: ["team", "scale", "product", "market"],
  FINANCE: ["scale", "tools", "product", "team"],
  MARKETING: ["product", "market", "scale", "tools"],
  CREATIVE: ["product", "market", "scale", "team"],
  TECHNICAL: ["tools", "scale", "product", "team"],
  GENERAL: ["product", "team", "market", "scale"],
};

const QUESTIONS: Record<ClarificationQuestion["id"], ClarificationQuestion> = {
  product: {
    id: "product",
    question: "What exactly will this person sell, support or work on?",
    why: "The tasks use your actual product or service so the case reads like your business.",
    placeholder: "e.g. industrial pumps to mid-sized factories",
  },
  market: {
    id: "market",
    question: "Which customer segment or market will they handle?",
    why: "Selling to enterprises and selling to consumers need different scenarios and trade-offs.",
    placeholder: "e.g. B2B enterprise accounts in South India",
  },
  team: {
    id: "team",
    question: "Will they manage a team, or work as an individual contributor?",
    why: "A team role needs delegation and coaching in the case; an individual role needs personal execution.",
    placeholder: "e.g. manages 6 account managers",
  },
  scale: {
    id: "scale",
    question: "What scale are they working at — target, volume or team size?",
    why: "Concrete figures make the task a real decision instead of a discussion prompt.",
    placeholder: "e.g. ₹25 lakh monthly target, 4-person team",
  },
  tools: {
    id: "tools",
    question: "Which tools or systems will they use day to day?",
    why: "The task should test the tools the role actually uses.",
    placeholder: "e.g. Excel, SQL and a Power BI dashboard",
  },
};

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

/** True when the brief already contains at least one figure, so scale is not missing. */
export function briefHasFigures(text: string): boolean {
  return has(text, SCALE_WORDS);
}

/**
 * The questions worth asking for this brief, most useful first. An empty array means the brief
 * already carries enough detail and the recruiter should not be interrupted.
 */
export function clarificationQuestions(input: ClarificationInput): ClarificationQuestion[] {
  const text = input.requirementsText.trim();
  const lower = text.toLowerCase();
  const role = (input.jobTitle ?? "").toLowerCase();
  const level = (input.targetLevel ?? "").toUpperCase();

  const family = detectFamily(
    input.skillSlugs.join(" "),
    (input.skillNames ?? []).join(" "),
    lower,
  );

  const missing: Record<ClarificationQuestion["id"], boolean> = {
    product: !has(lower, PRODUCT_WORDS),
    market: !has(lower, MARKET_WORDS),
    team:
      !has(lower, TEAM_WORDS) &&
      (level === "SENIOR" || level === "MID" || /head|lead|manager|director|vp|chief/.test(role)),
    scale: !briefHasFigures(text),
    tools: !has(lower, TOOL_WORDS),
  };

  const questions: ClarificationQuestion[] = [];
  for (const id of FAMILY_ORDER[family]) {
    if (!missing[id]) continue;
    // Tools only matter for work that is done in a tool.
    if (id === "tools" && family !== "DATA" && family !== "TECHNICAL" && family !== "FINANCE") continue;
    questions.push(QUESTIONS[id]);
    if (questions.length === 3) break;
  }

  // A brief this short is missing context of some kind; the role question is the safest single ask.
  if (questions.length === 0 && text.length < 80) {
    questions.push(QUESTIONS.scale);
  }

  return questions;
}

/** Folds the recruiter's answers into the brief so generation and the stored draft both see them. */
export function mergeClarifications(
  requirementsText: string,
  answers: { question: string; answer: string }[],
): string {
  const usable = answers
    .map((row) => ({ question: row.question.trim(), answer: row.answer.trim() }))
    .filter((row) => row.question.length > 0 && row.answer.length > 0);
  if (usable.length === 0) return requirementsText.trim();

  const block = usable.map((row) => `- ${row.question} ${row.answer}`).join("\n");
  return `${requirementsText.trim()}\n\nAdditional context from the recruiter:\n${block}`.slice(0, 3000);
}
