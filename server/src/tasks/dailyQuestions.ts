/**
 * Checkable questions for daily practice.
 *
 * Each skill family has three tiers that progress in the work they demand, not in word count:
 * BEGINNER is a single, short step; INTERMEDIATE adds a constraint or a second calculation;
 * ADVANCED is an application problem where two or three rules have to be combined correctly.
 *
 * Every question carries the accepted answers and a short explanation on the server. The answer
 * key is stored with the task and is only sent back after the candidate has submitted something,
 * so the page can never be used to look up tomorrow's answer.
 */

import type { SkillFamily } from "../assessments/scenarios";

export type DailyDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type DailyQuestionType = "NUMBER" | "SHORT_TEXT";

export type DailyQuestion = {
  question: string;
  type: DailyQuestionType;
  /** Canonical answer first; further entries are accepted spellings of the same answer. */
  accepted: string[];
  explanation: string;
};

/** Deterministic offset so the same seed always yields the same figures. */
function seedAt(seed: number, position: number): number {
  const x = Math.sin(seed * 9301 + position * 49297) * 233280;
  return Math.abs(Math.floor(x)) % 1000;
}

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function rounded(value: number): string {
  return String(Math.round(value * 100) / 100);
}

type Builder = (seed: number) => DailyQuestion;

const BANK: Record<SkillFamily, Record<DailyDifficulty, Builder>> = {
  SALES: {
    BEGINNER: (seed) => {
      const price = 32_000 + (seedAt(seed, 1) % 9) * 4_000;
      const final = Math.round(price * 0.9);
      return {
        question: `A customer agrees to an order worth ${money(price)} and asks for the standard 10% discount. What is the final order value in rupees?`,
        type: "NUMBER",
        accepted: [rounded(final)],
        explanation: `10% of ${money(price)} is ${money(price * 0.1)}, so the order becomes ${money(final)}.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const target = 400_000 + (seedAt(seed, 2) % 5) * 50_000;
      const closed = 55 + (seedAt(seed, 3) % 15);
      const shortfall = Math.round((target * (100 - closed)) / 100);
      return {
        question: `Your monthly target is ${money(target)} and you have closed ${closed}% of it. What is the shortfall in rupees?`,
        type: "NUMBER",
        accepted: [rounded(shortfall)],
        explanation: `You still need ${100 - closed}% of ${money(target)}, which is ${money(shortfall)}.`,
      };
    },
    ADVANCED: (seed) => {
      const listPrice = 600_000 + (seedAt(seed, 4) % 5) * 100_000;
      const discounted = listPrice * 0.95;
      const maxCost = Math.round(discounted * 0.88);
      return {
        question: `A deal is priced at ${money(listPrice)}. You may discount up to 5%, but gross margin must stay at or above 12% of the discounted price. What is the highest delivery cost, in rupees, that still meets the margin floor?`,
        type: "NUMBER",
        accepted: [rounded(maxCost)],
        explanation: `A 5% discount gives ${money(discounted)}. To keep a 12% margin, cost can be at most 88% of that, which is ${money(maxCost)}.`,
      };
    },
  },

  SERVICE: {
    BEGINNER: (seed) => {
      const startHour = 9 + (seedAt(seed, 36) % 2);
      const startMinute = [0, 15, 30, 45][seedAt(seed, 37) % 4];
      const targetHours = 3 + (seedAt(seed, 38) % 2);
      const totalMinutes = startHour * 60 + startMinute + targetHours * 60;
      const latest = `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
      return {
        question: `A support ticket arrives at ${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")} and the first-response target is ${targetHours} hours. What is the latest response time in 24-hour HH:MM?`,
        type: "SHORT_TEXT",
        accepted: [latest],
        explanation: `${targetHours} hours after ${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")} is ${latest}.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const needs = 480 + (seedAt(seed, 5) % 5) * 20;
      const inStock = 360;
      const inbound = 75;
      const missing = needs - inStock - inbound;
      return {
        question: `A customer needs ${needs} units on Friday. They already hold ${inStock} units and you can ship ${inbound} units today. How many units are still missing?`,
        type: "NUMBER",
        accepted: [rounded(missing)],
        explanation: `${inStock} + ${inbound} = ${inStock + inbound} units covered, so ${needs} − ${inStock + inbound} = ${missing} are missing.`,
      };
    },
    ADVANCED: (seed) => {
      const owed = 22_000 + (seedAt(seed, 6) % 8) * 1_000;
      const net = Math.round(owed * 0.92);
      const needsApproval = Math.max(0, net - 15_000);
      return {
        question: `A customer is owed ${money(owed)}. You deduct an 8% restocking fee, and any refund above ₹15,000 needs manager approval. How many rupees of the refund need approval?`,
        type: "NUMBER",
        accepted: [rounded(needsApproval)],
        explanation: `After the 8% fee the refund is ${money(net)}. The amount above the ₹15,000 threshold is ${money(needsApproval)}.`,
      };
    },
  },

  OPERATIONS: {
    BEGINNER: (seed) => {
      const rate = 100 + (seedAt(seed, 7) % 4) * 20;
      const minutes = seedAt(seed, 8) % 2 === 0 ? 30 : 45;
      const units = (rate * minutes) / 60;
      return {
        question: `A line signs off ${rate} units an hour. How many units does it produce in ${minutes} minutes at that rate?`,
        type: "NUMBER",
        accepted: [rounded(units)],
        explanation: `${minutes} minutes is ${minutes / 60} of an hour, so ${rate} × ${minutes / 60} = ${rounded(units)} units.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const capacity = 300 + (seedAt(seed, 9) % 4) * 50;
      const days = 5;
      const commitment = capacity * days + 250;
      const shortfall = commitment - capacity * days;
      return {
        question: `A line can sign off ${capacity} units a day. The week's commitment is ${commitment} units over ${days} working days. How many units short will you be?`,
        type: "NUMBER",
        accepted: [rounded(shortfall)],
        explanation: `${days} days at ${capacity} units is ${capacity * days} units, leaving ${commitment} − ${capacity * days} = ${shortfall} units short.`,
      };
    },
    ADVANCED: (seed) => {
      const capacity = 320 + (seedAt(seed, 10) % 4) * 40;
      const days = 6;
      const maxOutput = Math.round(capacity * 1.3 * days);
      return {
        question: `A line runs at ${capacity} units a day for ${days} days. Overtime can raise capacity by 40%, but quality can only sign off 30% above the normal daily volume. What is the maximum output, in units, for those ${days} days?`,
        type: "NUMBER",
        accepted: [rounded(maxOutput)],
        explanation: `Quality caps the daily volume at 30% above normal, so the 40% overtime gain cannot all be used. ${capacity} × 1.30 × ${days} = ${maxOutput} units.`,
      };
    },
  },

  DATA: {
    BEGINNER: (seed) => {
      const total = 500 + (seedAt(seed, 11) % 5) * 100;
      const percent = 20 + (seedAt(seed, 12) % 5) * 5;
      const converted = (total * percent) / 100;
      return {
        question: `${converted} of ${total} users converted. What is the conversion rate in percent?`,
        type: "NUMBER",
        accepted: [rounded(percent)],
        explanation: `${converted} ÷ ${total} = ${percent / 100}, which is ${percent}%.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const visits = 18_000 + (seedAt(seed, 13) % 5) * 1_000;
      const rate = 4.5;
      const conversions = Math.round(visits * 0.9 * (rate / 100));
      return {
        question: `Last month a site had ${visits.toLocaleString("en-IN")} visits and converted 4.5%. This month visits are down 10% and the conversion rate is unchanged. How many conversions this month?`,
        type: "NUMBER",
        accepted: [rounded(conversions)],
        explanation: `Visits fall to ${Math.round(visits * 0.9)}, and 4.5% of that is ${conversions} conversions.`,
      };
    },
    ADVANCED: (seed) => {
      const revenueDrop = [10, 12, 15, 20][seedAt(seed, 14) % 4];
      const unitDrop = 20;
      const priceChange = Math.round(((1 - revenueDrop / 100) / (1 - unitDrop / 100) - 1) * 10000) / 100;
      return {
        question: `Revenue fell ${revenueDrop}% this quarter while the number of units sold fell ${unitDrop}%. By what percent did average price per unit change? Give the percentage as a number.`,
        type: "NUMBER",
        accepted: [rounded(priceChange)],
        explanation: `Revenue per unit = revenue ÷ units. The ratio is ${(1 - revenueDrop / 100).toFixed(2)} ÷ 0.80 = ${(1 - revenueDrop / 100) / 0.8}, so the average price changed by ${priceChange}%.`,
      };
    },
  },

  PEOPLE: {
    BEGINNER: (seed) => {
      const team = 6 + (seedAt(seed, 15) % 4);
      const minutes = 20 + (seedAt(seed, 16) % 3) * 5;
      const total = team * minutes;
      return {
        question: `You hold a ${minutes}-minute one-to-one with each of your ${team} team members this week. How many minutes do the meetings take in total?`,
        type: "NUMBER",
        accepted: [rounded(total)],
        explanation: `${team} people × ${minutes} minutes = ${total} minutes.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const team = 10 + (seedAt(seed, 17) % 3);
      const tasks = 420 + (seedAt(seed, 18) % 4) * 40;
      const share = 40;
      const carried = Math.round((tasks * share) / 100);
      return {
        question: `A team of ${team} delivers ${tasks} tasks a month. Two people carry ${share}% of the work between them. How many tasks do those two carry?`,
        type: "NUMBER",
        accepted: [rounded(carried)],
        explanation: `${share}% of ${tasks} is ${carried} tasks.`,
      };
    },
    ADVANCED: (seed) => {
      const team = 8 + (seedAt(seed, 19) % 4);
      const target = 400 + (seedAt(seed, 20) % 5) * 50;
      const done = 60 + (seedAt(seed, 21) % 4) * 5;
      const each = Math.round((target * (100 - done)) / 100 / team * 100) / 100;
      return {
        question: `A team of ${team} has delivered ${done}% of a ${target}-unit target. You redistribute the remaining work equally across the team. How many units does each person take?`,
        type: "NUMBER",
        accepted: [rounded(each)],
        explanation: `${100 - done}% of ${target} is ${target - (target * done) / 100} units, divided by ${team} people gives ${each} units each.`,
      };
    },
  },

  FINANCE: {
    BEGINNER: (seed) => {
      const budget = 180_000 + (seedAt(seed, 22) % 4) * 20_000;
      const spent = 120_000;
      const left = budget - spent;
      return {
        question: `A budget is ${money(budget)} and ${money(spent)} has been spent. How much is left, in rupees?`,
        type: "NUMBER",
        accepted: [rounded(left)],
        explanation: `${money(budget)} − ${money(spent)} = ${money(left)}.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const budget = 360_000 + (seedAt(seed, 23) % 4) * 40_000;
      const actual = budget + 80_000;
      const over = Math.round(((actual - budget) / budget) * 10000) / 100;
      return {
        question: `Costs came in at ${money(actual)} against a ${money(budget)} budget. By what percent is the budget exceeded?`,
        type: "NUMBER",
        accepted: [rounded(over)],
        explanation: `The overspend is ${money(actual - budget)}; ${actual - budget} ÷ ${budget} = ${over}%.`,
      };
    },
    ADVANCED: (seed) => {
      const spend = 100_000 + (seedAt(seed, 24) % 4) * 10_000;
      const increase = 9;
      const passedOn = 5;
      const absorbed = Math.round((spend * (increase - passedOn)) / 100);
      return {
        question: `A supplier raises prices by ${increase}%. You pass ${passedOn}% on to customers and absorb the rest. On a monthly spend of ${money(spend)}, how many rupees a month do you absorb?`,
        type: "NUMBER",
        accepted: [rounded(absorbed)],
        explanation: `You absorb ${increase - passedOn}% of ${money(spend)}, which is ${money(absorbed)} a month.`,
      };
    },
  },

  MARKETING: {
    BEGINNER: (seed) => {
      const impressions = 30_000 + (seedAt(seed, 25) % 4) * 5_000;
      const clicks = Math.round(impressions * 0.03);
      return {
        question: `A campaign receives ${clicks.toLocaleString("en-IN")} clicks from ${impressions.toLocaleString("en-IN")} impressions. What is the click-through rate in percent?`,
        type: "NUMBER",
        accepted: ["3"],
        explanation: `${clicks} ÷ ${impressions} = 0.03, which is 3%.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const budget = 50_000 + (seedAt(seed, 26) % 4) * 10_000;
      const leads = 250;
      const cpl = Math.round((budget / leads) * 100) / 100;
      return {
        question: `You have ${money(budget)} left and must deliver ${leads} qualified leads. What is the maximum cost per lead, in rupees?`,
        type: "NUMBER",
        accepted: [rounded(cpl)],
        explanation: `${money(budget)} ÷ ${leads} leads = ${money(cpl)} per lead at most.`,
      };
    },
    ADVANCED: (seed) => {
      const leads = 300 + (seedAt(seed, 27) % 4) * 20;
      const targetCpl = 200;
      const spent = 90_000;
      const overspend = spent - leads * targetCpl;
      return {
        question: `A campaign spent ${money(spent)} and delivered ${leads} leads. The target cost per lead is ₹200. How many rupees over the target spend are you?`,
        type: "NUMBER",
        accepted: [rounded(overspend)],
        explanation: `${leads} leads at ₹200 should cost ${money(leads * targetCpl)}. You spent ${money(spent)}, so you are ${money(overspend)} over.`,
      };
    },
  },

  CREATIVE: {
    BEGINNER: (seed) => {
      const crops = 2 + (seedAt(seed, 39) % 3);
      const banners = 1 + (seedAt(seed, 40) % 3);
      const total = 1 + crops + 1 + banners;
      return {
        question: `A campaign needs one key image, ${crops} social crops, one 20-second video cut-down and ${banners} banner sizes. How many assets is that in total?`,
        type: "NUMBER",
        accepted: [String(total)],
        explanation: `1 key image + ${crops} crops + 1 video + ${banners} banners = ${total} assets.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const days = 10 + (seedAt(seed, 28) % 4) * 2;
      const production = 4;
      const revisions = 3 * 2;
      const buffer = days - production - revisions;
      return {
        question: `A launch is in ${days} days. Production takes ${production} days and you have three revision rounds of two days each. How many spare days remain?`,
        type: "NUMBER",
        accepted: [rounded(buffer)],
        explanation: `${production} production days + ${revisions} revision days = ${production + revisions}; ${days} − ${production + revisions} = ${buffer} spare days.`,
      };
    },
    ADVANCED: (seed) => {
      const budget = 40_000 + (seedAt(seed, 29) % 4) * 5_000;
      const images = 4;
      const imageCost = 1_500;
      const video = 9_000;
      const spend = images * imageCost + video;
      const contingency = spend * 0.1;
      const left = Math.round(budget - spend - contingency);
      return {
        question: `An asset budget is ${money(budget)}. You need ${images} images at ${money(imageCost)} each and video licensing at ${money(video)}. You also hold a 10% contingency on that spend. How much is left for retouching?`,
        type: "NUMBER",
        accepted: [rounded(left)],
        explanation: `Images and video cost ${money(spend)}; a 10% contingency is ${money(contingency)}, leaving ${money(left)}.`,
      };
    },
  },

  TECHNICAL: {
    BEGINNER: (seed) => {
      const current = 700 + (seedAt(seed, 30) % 4) * 100;
      const target = 500;
      const reduction = Math.round(((current - target) / current) * 10000) / 100;
      return {
        question: `An API request takes ${current} ms and the target is ${target} ms. By what percent must the response time be reduced?`,
        type: "NUMBER",
        accepted: [rounded(reduction)],
        explanation: `The saving is ${current - target} ms; ${current - target} ÷ ${current} = ${reduction}%.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const requests = 2_000 + (seedAt(seed, 31) % 4) * 500;
      const failureRate = 8;
      const failures = Math.round((requests * failureRate) / 100);
      return {
        question: `An endpoint fails for ${failureRate}% of its ${requests.toLocaleString("en-IN")} daily requests. How many failures is that per day?`,
        type: "NUMBER",
        accepted: [rounded(failures)],
        explanation: `${failureRate}% of ${requests} = ${failures} failures a day.`,
      };
    },
    ADVANCED: (seed) => {
      const records = 1_500 + (seedAt(seed, 32) % 4) * 250;
      const dropped = Math.round(records * 0.12);
      const recovered = Math.round(dropped * 0.6);
      const missing = dropped - recovered;
      return {
        question: `An import of ${records} records silently dropped 12% of them. A retry recovered 60% of the dropped records. How many records are still missing?`,
        type: "NUMBER",
        accepted: [rounded(missing)],
        explanation: `12% of ${records} is ${dropped} records; 60% of those were recovered, leaving ${missing} still missing.`,
      };
    },
  },

  GENERAL: {
    BEGINNER: (seed) => {
      const commitment = 240 + (seedAt(seed, 33) % 4) * 30;
      const delivered = 180;
      const remaining = commitment - delivered;
      return {
        question: `A client commitment is ${commitment} units and ${delivered} have been delivered. How many units remain?`,
        type: "NUMBER",
        accepted: [rounded(remaining)],
        explanation: `${commitment} − ${delivered} = ${remaining} units remaining.`,
      };
    },
    INTERMEDIATE: (seed) => {
      const remaining = 22 + (seedAt(seed, 34) % 4) * 2;
      const daysLeft = 20;
      const extra = remaining - daysLeft;
      return {
        question: `A project has 20 working days left and the remaining work needs ${remaining} days at the current rate. How many extra days does the team need?`,
        type: "NUMBER",
        accepted: [rounded(extra)],
        explanation: `${remaining} needed − ${daysLeft} available = ${extra} extra days.`,
      };
    },
    ADVANCED: (seed) => {
      const total = 500 + (seedAt(seed, 35) % 4) * 50;
      const teamA = 55;
      const teamB = 30;
      const outstanding = Math.round((total * (100 - teamA - teamB)) / 100);
      return {
        question: `Two teams share a ${total}-unit commitment. Team A delivers ${teamA}% and Team B delivers ${teamB}% of the total. How many units are still outstanding?`,
        type: "NUMBER",
        accepted: [rounded(outstanding)],
        explanation: `Together they deliver ${teamA + teamB}%, so ${100 - teamA - teamB}% of ${total} is still outstanding: ${outstanding} units.`,
      };
    },
  },
};

const HINTS: Record<DailyQuestionType, string[]> = {
  NUMBER: [
    "Write down the figures the question gives you before calculating.",
    "Carry the units through each step; combine percentages in the right order.",
    "Enter just the number — no currency symbols, commas or % sign.",
  ],
  SHORT_TEXT: [
    "Note exactly what the question asks you to give back.",
    "Apply the rule in the question without adding extra steps.",
    "Answer in the format the question asks for, e.g. 24-hour HH:MM.",
  ],
};

/** Builds the checkable question for one skill family and difficulty. Deterministic for a seed. */
export function buildDailyQuestion(input: {
  seed: number;
  family: SkillFamily;
  difficulty: DailyDifficulty;
}): DailyQuestion & { hints: string[] } {
  const question = BANK[input.family][input.difficulty](input.seed);
  return { ...question, hints: HINTS[question.type] };
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
  if (!submitted.trim() || accepted.length === 0) return false;

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
