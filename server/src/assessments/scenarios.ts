/**
 * Scenario construction for practice and assessment tasks.
 *
 * The recruiter's brief and the skill being tested decide the family of work (sales, service,
 * operations, data, people, finance, marketing, technical). Each family has concrete scenario
 * templates that carry figures, a named constraint, a deliverable and evaluation criteria.
 *
 * Everything here is deterministic: the same seed and brief always produce the same case, so an
 * assessment can be re-assembled without the wording drifting from the stored facts.
 */

export type SkillFamily =
  | "SALES"
  | "SERVICE"
  | "OPERATIONS"
  | "DATA"
  | "PEOPLE"
  | "FINANCE"
  | "MARKETING"
  | "CREATIVE"
  | "TECHNICAL"
  | "GENERAL";

type FamilyRule = { family: SkillFamily; keywords: string[] };

// Order matters: the first family with a matching keyword wins.
const FAMILY_RULES: FamilyRule[] = [
  {
    family: "SALES",
    keywords: [
      "sales",
      "negotiat",
      "business-development",
      "business development",
      "cold-call",
      "lead-generation",
      "pipeline",
      "deal",
      "upsell",
      "revenue",
      "quota",
    ],
  },
  {
    family: "SERVICE",
    keywords: [
      "client-communication",
      "customer",
      "client",
      "support",
      "service",
      "complaint",
      "email",
      "relationship",
      "hospitality",
      "front-desk",
    ],
  },
  {
    family: "DATA",
    keywords: [
      "excel",
      "data",
      "analy",
      "sql",
      "statistic",
      "dashboard",
      "report",
      "research",
      "quant",
      "metric",
      "spreadsheet",
    ],
  },
  {
    family: "FINANCE",
    keywords: ["financ", "account", "budget", "cost", "audit", "pricing", "tax", "payroll", "profit"],
  },
  {
    family: "PEOPLE",
    keywords: [
      "leadership",
      "management",
      "team",
      "people",
      "human-resource",
      "human resource",
      "recruit",
      "coach",
      "mentor",
      "training",
      "hr",
    ],
  },
  {
    family: "MARKETING",
    keywords: ["marketing", "seo", "content", "social", "brand", "campaign", "advertis", "copywrit"],
  },
  {
    family: "CREATIVE",
    keywords: [
      "graphic",
      "video",
      "illustration",
      "animation",
      "photograph",
      "creative",
      "design",
      "ux",
      "ui-",
    ],
  },
  {
    family: "TECHNICAL",
    keywords: [
      "python",
      "javascript",
      "typescript",
      "code",
      "coding",
      "developer",
      "development",
      "web",
      "engineering",
      "software",
      "api",
      "database",
      "security",
      "testing",
      "autocad",
      "technical",
      "network",
      "cloud",
    ],
  },
  {
    family: "OPERATIONS",
    keywords: [
      "operation",
      "process",
      "project",
      "supply",
      "inventory",
      "schedul",
      "quality",
      "logistic",
      "warehouse",
      "procurement",
      "delivery",
      "estimation",
    ],
  },
];

export function detectFamily(skillSlug: string, skillName: string, brief = ""): SkillFamily {
  const haystack = `${skillSlug} ${skillName}`.toLowerCase();
  for (const rule of FAMILY_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) return rule.family;
  }
  // The skill name alone is inconclusive for a label like "Communication"; the brief decides.
  const briefText = brief.toLowerCase();
  for (const rule of FAMILY_RULES) {
    if (rule.keywords.some((keyword) => briefText.includes(keyword))) return rule.family;
  }
  return "GENERAL";
}

/** Facts lifted from the recruiter's brief, with deterministic defaults where it is silent. */
export type ScenarioFacts = {
  role: string;
  company: string;
  product: string;
  market: string;
  target: string;
  achievedPercent: number;
  gap: string;
  days: number;
  teamSize: number;
  seniority: "individual" | "team";
  brief: string;
};

const PRODUCT_HINTS: { keywords: string[]; product: string }[] = [
  { keywords: ["saas", "software", "platform", "application", "app "], product: "the software platform" },
  { keywords: ["apparel", "clothing", "fashion", "garment"], product: "apparel" },
  { keywords: ["fmcg", "consumer goods", "packaged"], product: "consumer goods" },
  { keywords: ["industrial", "equipment", "machine", "manufactur"], product: "industrial equipment" },
  { keywords: ["logistics", "freight", "supply chain", "courier"], product: "freight services" },
  { keywords: ["insurance", "policy", "policies"], product: "insurance policies" },
  { keywords: ["edtech", "education", "training", "course"], product: "training programmes" },
  { keywords: ["pharma", "healthcare", "hospital", "clinic"], product: "healthcare products" },
  { keywords: ["bank", "loan", "credit", "fintech"], product: "financial products" },
  { keywords: ["hotel", "hospitality", "restaurant", "travel"], product: "hospitality services" },
  { keywords: ["real estate", "property", "housing"], product: "property" },
  { keywords: ["retail", "store", "outlet", "supermarket"], product: "retail store sales" },
];

const FAMILY_PRODUCT: Record<SkillFamily, string> = {
  SALES: "the company's flagship product line",
  SERVICE: "the company's service offering",
  OPERATIONS: "the company's core operations",
  DATA: "the company's reporting",
  PEOPLE: "the team's work",
  FINANCE: "the company's finances",
  MARKETING: "the company's campaigns",
  CREATIVE: "the company's brand and product assets",
  TECHNICAL: "the company's product",
  GENERAL: "the company's work",
};

function pickProduct(brief: string, family: SkillFamily): string {
  const text = brief.toLowerCase();
  for (const hint of PRODUCT_HINTS) {
    if (hint.keywords.some((keyword) => text.includes(keyword))) return hint.product;
  }
  return FAMILY_PRODUCT[family];
}

function pickMarket(brief: string): string {
  const text = brief.toLowerCase();
  if (/\bb2b\b|enterprise|corporate|institutional/.test(text)) return "enterprise, business-to-business";
  if (/\bb2c\b|consumer|direct-to-consumer|\bd2c\b/.test(text)) return "direct-to-consumer";
  if (/\bsmb\b|small business|sme\b/.test(text)) return "small and mid-sized businesses";
  if (/export|international|overseas/.test(text)) return "export";
  if (/government|public sector|tender/.test(text)) return "government and public-sector";
  return "regional mid-market";
}

function amountFrom(text: string): string | null {
  const match = text.match(/(?:₹|rs\.?\s?|inr\s?)([\d,.]+)\s*(lakh|crore|thousand|k)?/i);
  if (match) {
    const unit = match[2] ? ` ${match[2].toLowerCase()}` : "";
    return `₹${match[1]}${unit === " k" ? " thousand" : unit}`;
  }
  const plain = text.match(/([\d,.]+)\s*(lakh|crore)\b/i);
  if (plain) return `₹${plain[1]} ${plain[2].toLowerCase()}`;
  return null;
}

function percentFrom(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 5 && value <= 95 ? value : null;
}

function daysFrom(text: string): number | null {
  const match = text.match(/(\d{1,2})\s*(?:working\s*)?days?\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 3 && value <= 60 ? value : null;
}

function teamFrom(text: string): number | null {
  const match =
    text.match(/team of (\d{1,3})/i) ?? text.match(/(\d{1,3})[- ](?:person|people|member)s?\s+team/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 2 && value <= 60 ? value : null;
}

/** Deterministic pseudo-random offset so different seeds vary the case without drifting. */
function seeded(seed: number, position: number): number {
  const x = Math.sin(seed * 9301 + position * 49297) * 233280;
  return Math.abs(Math.floor(x)) % 1000;
}

export function readScenarioFacts(input: {
  jobTitle?: string;
  companyName?: string;
  requirementsText?: string;
  level?: string;
  seed: number;
  family: SkillFamily;
}): ScenarioFacts {
  const brief = (input.requirementsText ?? "").trim();
  const text = brief.toLowerCase();
  const target = amountFrom(brief) ?? `₹${18 + (seeded(input.seed, 1) % 22)} lakh`;
  const achievedPercent = percentFrom(brief) ?? 55 + (seeded(input.seed, 2) % 20);
  const days = daysFrom(brief) ?? 8 + (seeded(input.seed, 3) % 6);
  const teamSize = teamFrom(brief) ?? 4 + (seeded(input.seed, 4) % 5);
  const targetNumber = Number(target.replace(/[^\d.]/g, "")) || 25;
  const gapValue = ((targetNumber * (100 - achievedPercent)) / 100).toFixed(1).replace(/\.0$/, "");
  const unit = target.includes("crore") ? "crore" : target.includes("lakh") ? "lakh" : "";
  const gap = unit ? `₹${gapValue} ${unit}` : `₹${gapValue}`;

  const role = input.jobTitle?.trim() || "senior manager";
  const looksLikeLead = /head|lead|manager|director|vp|chief/i.test(role) || /team/i.test(text);
  const level = (input.level ?? "").toUpperCase();
  const seniority: ScenarioFacts["seniority"] =
    looksLikeLead || level === "SENIOR" || level === "MID" ? "team" : "individual";

  return {
    role,
    company: input.companyName?.trim() || "a mid-sized company",
    product: pickProduct(brief, input.family),
    market: pickMarket(brief),
    target,
    achievedPercent,
    gap,
    days,
    teamSize,
    seniority,
    brief,
  };
}

type Criterion = {
  name: string;
  description: string;
  maxMarks: number;
  privateGuidance: string;
};

type ScenarioTemplate = {
  headline: (facts: ScenarioFacts) => string;
  body: (facts: ScenarioFacts, variant: number) => string;
  deliverable: string;
  criteria: (facts: ScenarioFacts) => Criterion[];
  keyFacts: (facts: ScenarioFacts) => string[];
  redFlags: string[];
};

const TEAM_LINE = (facts: ScenarioFacts) =>
  facts.seniority === "team"
    ? `You manage a team of ${facts.teamSize} people, two of whom joined in the last quarter.`
    : "You work on your own but depend on two other teams to deliver.";

const TEMPLATES: Record<SkillFamily, ScenarioTemplate> = {
  SALES: {
    headline: (facts) => `recovering the ${facts.target} monthly target`,
    body: (facts, variant) => {
      const events = [
        `Your largest account, which contributes about 22% of monthly revenue, has written to say it will move to a competitor unless three delivery problems are fixed this week.`,
        `Two of your five biggest accounts have put renewals on hold pending a pricing review, and a distributor has returned a quarter of last month's stock citing damaged packaging.`,
        `A key account has escalated to your managing director after a missed delivery, and your best salesperson resigned last Friday with two weeks' notice.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business selling ${facts.product}.`,
        `${TEAM_LINE(facts)} The team's monthly target is ${facts.target} and with ${facts.days} days left it has closed ${facts.achievedPercent}% of it, leaving ${facts.gap} still to find.`,
        events[variant % events.length],
        "You cannot discount below a 12% gross margin, the operations team has no spare capacity this month, and any price change above 5% needs finance approval.",
      ].join("\n\n");
    },
    deliverable:
      "Write an action plan for the remaining period. Cover how you will keep the at-risk account, where the missing revenue will come from, what you will do differently with the team next month, and which numbers you will review each week. Use short headings and name who does what by when. At most 500 words.",
    criteria: (facts) => [
      {
        name: "Reads the commercial position",
        description: "Uses the target, the shortfall and the time left to frame the decision.",
        maxMarks: 20,
        privateGuidance: `Strong answers restate the ${facts.gap} gap against ${facts.days} days, separate revenue that can realistically be recovered from revenue that cannot, and note the margin floor. Weak answers list sales tactics without doing the arithmetic or acknowledging the 12% margin constraint.`,
      },
      {
        name: "Plan for the at-risk account",
        description: "A specific recovery plan for the client that is threatening to leave.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers name the escalation owner, a same-week commitment with dates, a root-cause check with operations, and a written follow-up to the client. Weak answers offer a discount, an apology, or 'improve communication' with no named action or date.",
      },
      {
        name: "Where the missing revenue comes from",
        description: "A realistic split between existing pipeline, existing accounts and new business.",
        maxMarks: 25,
        privateGuidance: `Strong answers split the ${facts.gap} into named sources with rough values and conversion assumptions, and say what is not achievable. Weak answers assert 'we will push the team harder' or invent pipeline without volumes or conversion.`,
      },
      {
        name: "Team plan and ownership",
        description: "Clear allocation of work across the team, with accountabilities and cadence.",
        maxMarks: 20,
        privateGuidance: `Strong answers reference the ${facts.teamSize}-person team, assign named responsibilities, protect the two new joiners from the highest-risk work, and set a weekly review. Weak answers talk about motivation in general terms or give the manager every task.`,
      },
      {
        name: "Prioritisation and trade-offs",
        description: "Names what will be dropped or delayed and why.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers explicitly defer lower-value activity, state the risk they accept, and say who is told. Weak answers claim everything can be done with no trade-off.",
      },
    ],
    keyFacts: (facts) => [
      `Monthly target ${facts.target}; ${facts.achievedPercent}% closed with ${facts.days} days left`,
      `Shortfall ${facts.gap}`,
      "Margin floor 12%; no spare operations capacity; price changes above 5% need finance approval",
      facts.seniority === "team" ? `Team of ${facts.teamSize}, two recent joiners` : "Depends on two other teams",
    ],
    redFlags: [
      "Discounts below the 12% margin floor",
      "Promises delivery dates without checking operations capacity",
      "No owner or date against any action",
    ],
  },

  SERVICE: {
    headline: () => "handling an escalated customer complaint",
    body: (facts, variant) => {
      const complaints = [
        `A customer who has spent ${facts.target} with you over two years has emailed for the third time this month. Their last three orders arrived late and one was short by 40 units, which delayed their own production line.`,
        `A long-standing client has posted a public complaint after a billing error was repeated twice, and their account manager is on leave until next week.`,
        `A customer's service request has been open for ${facts.days} days across four handovers. They have asked for a written explanation and a refund.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business selling ${facts.product}.`,
        `${TEAM_LINE(facts)} ${complaints[variant % complaints.length]}`,
        "You cannot approve a refund above ₹15,000 without your manager, the warehouse is closed for stock-taking for two days, and the customer needs an answer before their own commitment on Friday.",
      ].join("\n\n");
    },
    deliverable:
      "Draft the reply to the customer and a one-page internal plan. The reply should acknowledge what went wrong, say what will happen by when, and name one person they can reach. The internal plan should cover the fix, who owns it, and what stops it recurring. At most 450 words in total.",
    criteria: (facts) => [
      {
        name: "Acknowledges the customer's position",
        description: "Names the specific failure and its impact on the customer, without excuses.",
        maxMarks: 20,
        privateGuidance: `Strong answers name the late deliveries, the short shipment and the ${facts.days}-day delay, and connect them to the customer's production impact. Weak answers open with 'sorry for the inconvenience' without naming what happened.`,
      },
      {
        name: "Concrete repair plan",
        description: "Dates, quantities and actions the customer can hold you to.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers give a replacement or credit quantity, a date for each step, and the approval they still need. Weak answers promise to 'look into it' or 'prioritise' with no date or quantity.",
      },
      {
        name: "Internal ownership and escalation",
        description: "Says who fixes what internally and how the handover gaps are closed.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers name an owner, note the account manager's leave, and describe a single thread instead of four handovers. Weak answers keep the work with the responder and ignore the internal process failure.",
      },
      {
        name: "Tone and clarity",
        description: "Professional, calm and short enough for a customer to act on.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers are plain, structured and free of blame-shifting or jargon. Weak answers are defensive, over-long, or mix the internal plan into the customer reply.",
      },
      {
        name: "Prevents a repeat",
        description: "One or two concrete changes to stop the same failure recurring.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers propose a specific check (for example a dispatch confirmation, a billing double-check) with an owner. Weak answers say 'improve communication'.",
      },
    ],
    keyFacts: (facts) => [
      facts.brief ? `Customer context drawn from the brief` : "Long-standing customer, repeated failure",
      "Refund approval above ₹15,000 needs a manager",
      "Warehouse closed for two days",
      "Customer's own deadline is Friday",
    ],
    redFlags: [
      "Blaming the warehouse or the customer",
      "Promising a refund that needs approval",
      "No named contact for the customer",
    ],
  },

  OPERATIONS: {
    headline: (facts) => `closing the ${facts.gap} backlog in ${facts.days} days`,
    body: (facts, variant) => {
      const events = [
        `A supplier has missed two consecutive deliveries, so ${facts.gap} of orders are now behind schedule and three customers have escalated.`,
        `A quality check failure has held back a fifth of this month's output, and the audit is in ${facts.days} days.`,
        `A key machine has been down for four days and the maintenance vendor cannot attend until next week.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business running ${facts.product}.`,
        `${TEAM_LINE(facts)} ${events[variant % events.length]}`,
        `The monthly commitment is ${facts.target} of output. You have ${facts.days} days, overtime needs approval two days in advance, and the quality team cannot sign off more than 30% above normal daily volume.`,
      ].join("\n\n");
    },
    deliverable:
      "Write a recovery plan: what is actually achievable in the time left, the sequence of actions day by day, who owns each, what you will tell customers, and which measures tell you by mid-week whether the plan is working. At most 500 words.",
    criteria: (facts) => [
      {
        name: "Diagnosis with the numbers",
        description: "Separates what is recoverable from what is not, using quantities and dates.",
        maxMarks: 25,
        privateGuidance: `Strong answers compute what can be recovered in ${facts.days} days at the capped throughput, and state the residual shortfall. Weak answers promise the full ${facts.target} with no capacity arithmetic.`,
      },
      {
        name: "Recovery plan and sequencing",
        description: "An ordered plan with realistic dependencies.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers sequence supplier recovery, rework and overtime in the right order and show the dependency between them. Weak answers list parallel actions that compete for the same capacity.",
      },
      {
        name: "Constraints and risk",
        description: "Handles the approval lead time, the quality cap and the audit date.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers flag that overtime needs two days' notice and that quality sign-off caps the daily volume, and name the risk they accept. Weak answers ignore one or both constraints.",
      },
      {
        name: "Ownership and communication",
        description: "Names owners and what customers are told, and when.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers assign actions, set a customer communication point with a date, and describe the escalation path. Weak answers keep decisions unnamed or tell customers nothing until the end.",
      },
      {
        name: "Measurement and prevention",
        description: "Measures that detect slippage early and one change that prevents a repeat.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers name a mid-week checkpoint measure and a durable fix such as a buffer stock rule or a second supplier. Weak answers say 'monitor closely'.",
      },
    ],
    keyFacts: (facts) => [
      `Output commitment ${facts.target}`,
      `${facts.days} days remaining`,
      "Overtime needs two days' approval; quality sign-off capped at 30% above normal",
      facts.seniority === "team" ? `Team of ${facts.teamSize}` : "Depends on two other teams",
    ],
    redFlags: ["No capacity arithmetic", "Ignores the approval lead time", "No customer communication date"],
  },

  DATA: {
    headline: () => "explaining a drop in performance",
    body: (facts, variant) => {
      const events = [
        `Monthly revenue has fallen ${100 - facts.achievedPercent}% against plan, and the leadership team meets in ${facts.days} days.`,
        `A dashboard shows conversion down sharply for two weeks, but the marketing and sales teams each blame the other.`,
        `A regional report contradicts the national numbers, and both are being quoted in the same meeting.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business. ${events[variant % events.length]}`,
        `You have three files: daily transactions for the last 90 days, a customer list with sign-up dates, and a spreadsheet of campaign spend. ${facts.days} days is not enough to rebuild anything, and the leadership team wants a number and a recommendation, not a data-quality essay.`,
      ].join("\n\n");
    },
    deliverable:
      "Describe your analysis plan and the answer you would present. State the cuts you would make, the checks you would run before trusting the result, the two most likely explanations, and the decision you would recommend. At most 450 words.",
    criteria: () => [
      {
        name: "Frames the question",
        description: "Turns the complaint into a measurable question with a comparison baseline.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers define the metric, the baseline period and the comparison (for example week-on-week conversion by channel). Weak answers start listing charts without a defined question.",
      },
      {
        name: "Method and data checks",
        description: "Names the cuts, joins and validation checks before trusting the numbers.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers check duplicates, missing dates, definition changes and mix effects, and explain how they would reconcile the two conflicting sources. Weak answers take the report at face value or skip validation.",
      },
      {
        name: "Findings tied to evidence",
        description: "States what each cut showed and how confident it is.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers separate volume from mix from price, quote magnitudes, and mark assumptions. Weak answers assert a cause with no supporting cut.",
      },
      {
        name: "Recommendation",
        description: "A clear, costed next action for the leadership team.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers give one recommendation with an expected effect and the first measure to watch. Weak answers list options without choosing.",
      },
      {
        name: "Caveats and next steps",
        description: "Names what the data cannot yet answer and what would settle it.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers state limits honestly and name the data they would request next. Weak answers overclaim certainty.",
      },
    ],
    keyFacts: (facts) => [
      `Gap to plan: ${100 - facts.achievedPercent}%`,
      `${facts.days} days to the leadership meeting`,
      "Three sources: transactions, customer list, campaign spend",
      "Two conflicting reports must be reconciled",
    ],
    redFlags: ["Charts before a question", "No reconciliation of the two sources", "Certainty without evidence"],
  },

  PEOPLE: {
    headline: () => "turning around an underperforming team",
    body: (facts, variant) => {
      const events = [
        `Two of your ${facts.teamSize} people are carrying most of the work, one has missed three deadlines, and the team survey shows the lowest engagement score in the department.`,
        `A high performer has asked to leave, citing workload and unclear priorities, and two others have asked for the same conversation.`,
        `A reorganisation has merged two teams with different habits, and the first joint deadline is in ${facts.days} days.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}. ${TEAM_LINE(facts)} ${events[variant % events.length]}`,
        `The team's commitment is ${facts.target} for the month and you are at ${facts.achievedPercent}%. You cannot hire before next quarter, and any formal performance process needs HR involvement from the first documented conversation.`,
      ].join("\n\n");
    },
    deliverable:
      "Write your plan for the next 30 days: the conversations you will have and in what order, how work will be redistributed, what you will change about how the team runs, and how you will know it is working. At most 500 words.",
    criteria: (facts) => [
      {
        name: "Reads the team situation",
        description: "Separates individual performance from workload and system causes.",
        maxMarks: 20,
        privateGuidance: `Strong answers distinguish the missed deadlines from the distribution of work across ${facts.teamSize} people and the engagement signal. Weak answers label one person a problem immediately.`,
      },
      {
        name: "Plan for the individual",
        description: "A fair, specific plan for the person who is missing deadlines.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers set a clear expectation, a review date, the support offered, and the consequence, and mention HR involvement where a formal process starts. Weak answers avoid the conversation or move straight to exit.",
      },
      {
        name: "Workload and team design",
        description: "A concrete redistribution of work and priorities.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers name what the team stops doing, how the load moves off the two overloaded people, and what the manager takes on. Weak answers say 'rebalance the workload' without saying what is dropped.",
      },
      {
        name: "Communication and fairness",
        description: "How the change is explained and how people are heard.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers sequence the individual conversations before the team announcement, keep reasons confidential, and invite pushback. Weak answers announce first or discuss one person with the team.",
      },
      {
        name: "Measurement",
        description: "Measures and checkpoints that show whether it is working.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers name a 30-day checkpoint with two measures (delivery and engagement signals). Weak answers say 'monitor morale'.",
      },
    ],
    keyFacts: (facts) => [
      `Team of ${facts.teamSize}, two new joiners`,
      `Commitment ${facts.target} at ${facts.achievedPercent}%`,
      "No hiring before next quarter",
      "HR must be involved from the first formal performance conversation",
    ],
    redFlags: ["No documentation of the performance conversation", "Discussing one person with the team", "No trade-off"],
  },

  FINANCE: {
    headline: (facts) => `finding ${facts.gap} in the budget`,
    body: (facts, variant) => {
      const events = [
        `Costs are ${100 - facts.achievedPercent}% above plan with ${facts.days} days left in the quarter, and the finance director wants options before the board pack is finalised.`,
        `A supplier has proposed a 9% price increase from next month, and the contract renews in ${facts.days} days.`,
        `Two cost centres are overspending while a third is underspent, and the totals look fine at company level.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business. ${events[variant % events.length]}`,
        `The quarterly budget is ${facts.target}. You cannot cut committed contracts, headcount decisions are frozen, and any reforecast must be traceable to a source document.`,
      ].join("\n\n");
    },
    deliverable:
      "Write a short memo to the finance director: what the numbers say, the assumptions behind your reforecast, three options with their impact, your recommendation, and the controls you would put in place. At most 450 words.",
    criteria: () => [
      {
        name: "Reads the numbers",
        description: "Uses the variance, the timing and the committed spend correctly.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers separate committed from discretionary spend and show the remaining-period run rate. Weak answers treat the whole budget as cuttable.",
      },
      {
        name: "Analysis and assumptions",
        description: "States assumptions and where each figure came from.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers label assumptions, cite source documents, and show the arithmetic. Weak answers present conclusions without traceable figures.",
      },
      {
        name: "Options and recommendation",
        description: "Three realistic options with impact, and one recommendation.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers quantify each option, state the service or delivery consequence, and choose one. Weak answers list generic cost cuts ('reduce travel') with no value.",
      },
      {
        name: "Controls and compliance",
        description: "Respects committed contracts, the headcount freeze and audit requirements.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers exclude committed contracts and note the approval route. Weak answers propose breaking contracts or informal reclassification.",
      },
      {
        name: "Communication to non-finance",
        description: "Plain language with the key number up front.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers lead with the gap, avoid unexplained acronyms, and give one page. Weak answers are a spreadsheet transcript.",
      },
    ],
    keyFacts: (facts) => [
      `Quarterly budget ${facts.target}`,
      `${100 - facts.achievedPercent}% over plan`,
      `${facts.days} days left in the quarter`,
      "Committed contracts cannot be cut; headcount frozen",
    ],
    redFlags: ["Cutting committed contracts", "Untraceable figures", "No recommendation"],
  },

  MARKETING: {
    headline: () => "planning a campaign with a fixed budget",
    body: (facts, variant) => {
      const events = [
        `A campaign has spent ${facts.target} and delivered ${facts.achievedPercent}% of its lead target with ${facts.days} days left.`,
        `A competitor has cut prices and your inbound enquiries have halved in three weeks.`,
        `A launch is due in ${facts.days} days and the creative agency has delivered nothing usable.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business selling ${facts.product}. ${events[variant % events.length]}`,
        `The remaining budget is fixed, the sales team will not accept leads below a qualification threshold you must define, and any spend above ₹50,000 needs a purchase order.`,
      ].join("\n\n");
    },
    deliverable:
      "Write the plan: the audience and message, the channels and split of the remaining budget, the assets you need, how you will measure success, and what you would stop doing. At most 450 words.",
    criteria: () => [
      {
        name: "Audience and insight",
        description: "A specific audience with a reason to act now.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers name a segment, its trigger and its objection. Weak answers say 'target customers aged 25-45'.",
      },
      {
        name: "Plan and channel choices",
        description: "Channels justified by the audience and the time available.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers match channels to intent, explain what each channel is for, and drop channels that cannot deliver in the time. Weak answers spread budget thinly across everything.",
      },
      {
        name: "Budget and measurement",
        description: "An explicit split and the metric for each line.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers allocate the remaining budget, define the qualified-lead threshold, and give target cost per lead. Weak answers have no numbers.",
      },
      {
        name: "Creative and message",
        description: "A concrete message and proof point, not a slogan.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers give the headline, the proof and the call to action. Weak answers describe 'engaging content'.",
      },
      {
        name: "Risks",
        description: "Names the main execution risk and the fallback.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers name approval lead time or asset dependency and a fallback. Weak answers list no risks.",
      },
    ],
    keyFacts: (facts) => [
      `Spend ${facts.target}, ${facts.achievedPercent}% of lead target`,
      `${facts.days} days remaining`,
      "Remaining budget fixed; PO needed above ₹50,000",
      "Lead qualification threshold must be defined",
    ],
    redFlags: ["No qualification threshold", "Budget split missing", "Slogans without proof"],
  },

  TECHNICAL: {
    headline: () => "fixing a production problem under time pressure",
    body: (facts, variant) => {
      const events = [
        `The checkout flow intermittently fails for about ${100 - facts.achievedPercent}% of users on mobile, and support has 40 open tickets.`,
        `A release has doubled page load time, and the next release is due in ${facts.days} days.`,
        `A scheduled data import silently dropped records for two days, and a customer has noticed.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, working on ${facts.product}. ${events[variant % events.length]}`,
        `You have read-only production access, one other engineer available, and a change freeze on shared infrastructure until the release in ${facts.days} days.`,
      ].join("\n\n");
    },
    deliverable:
      "Write the technical plan: how you would reproduce and narrow the problem, the fix you would ship, the tests and checks you would add, the rollback plan, and what you would tell support. At most 450 words.",
    criteria: () => [
      {
        name: "Problem framing",
        description: "Narrows the failure with evidence before proposing a fix.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers start from logs, scope and reproduction steps, and state a hypothesis to test. Weak answers guess a cause and start rewriting.",
      },
      {
        name: "Approach and design",
        description: "A fix that fits the constraints and the existing system.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers respect the change freeze, describe the smallest safe change, and explain how it interacts with existing behaviour. Weak answers propose a rewrite or an unapproved infrastructure change.",
      },
      {
        name: "Correctness and edge cases",
        description: "Handles the failure modes and the data already affected.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers address partial writes, retries and the records already lost, and add a regression test. Weak answers fix the symptom only.",
      },
      {
        name: "Trade-offs and performance",
        description: "States the cost of the fix and what is deferred.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers name the performance or maintenance cost and what is deliberately deferred. Weak answers claim no downside.",
      },
      {
        name: "Testing and rollout",
        description: "A verification and rollback plan.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers define the check before and after deploy, and the rollback trigger. Weak answers say 'deploy and monitor'.",
      },
    ],
    keyFacts: (facts) => [
      `Failure affects roughly ${100 - facts.achievedPercent}% of users`,
      `${facts.days} days until the release`,
      "Read-only production access; change freeze on shared infrastructure",
      "One other engineer available",
    ],
    redFlags: ["Rewriting under a freeze", "No rollback plan", "Ignoring affected data"],
  },

  CREATIVE: {
    headline: () => "delivering a campaign under a fixed brief",
    body: (facts, variant) => {
      const events = [
        `A product launch is due in ${facts.days} days. The brand team has approved one concept, three rounds of revisions and a fixed asset list: one key image, three social crops and a 20-second video cut-down.`,
        `A client has rejected the second draft of a campaign, saying it "does not feel like us", two days before the handover.`,
        `A rebrand has to land across the website, packaging and social channels in ${facts.days} days, and two stakeholders want different logos.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}, a ${facts.market} business working on ${facts.product}.`,
        `${events[variant % 3]} You have one other designer, no budget for new photography, and the brand guidelines were last updated two years ago.`,
      ].join("\n\n");
    },
    deliverable:
      "Write the design response: the idea and the single message, what each of the required assets shows, how the set stays consistent, what you would cut if time runs short, and how you would present it to the client. At most 450 words.",
    criteria: () => [
      {
        name: "Reads the brief and the audience",
        description: "States the audience, the message and what the client actually asked for.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers name the audience, the response the work should provoke and the constraint that shapes it. Weak answers jump to visual style without a message.",
      },
      {
        name: "Concept and message",
        description: "One clear idea, expressed so a client can judge it.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers give one idea, the headline and the proof, and explain why it fits the brand. Weak answers list several unrelated directions or rely on adjectives like 'clean and modern'.",
      },
      {
        name: "Assets and consistency",
        description: "A concrete plan for each asset that holds together as a set.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers describe what appears in the key image, the crops and the video cut-down, and the rules that keep them consistent. Weak answers repeat the same layout at three sizes.",
      },
      {
        name: "Constraints and trade-offs",
        description: "Handles the fixed revisions, missing photography and the deadline.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers name what is cut, how existing photography is reused, and what goes in the third revision. Weak answers promise everything with no trade-off.",
      },
      {
        name: "Presentation and rationale",
        description: "Explains the work to a non-designer in a way that invites a decision.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers give the client a decision to make and a reason. Weak answers describe tools and software.",
      },
    ],
    keyFacts: (facts) => [
      `${facts.days} days to handover`,
      "One approved concept, three revision rounds, fixed asset list",
      "No budget for new photography",
      "Brand guidelines two years old",
    ],
    redFlags: ["No single message", "Promises more than the asset list allows", "Tool talk instead of rationale"],
  },

  GENERAL: {
    headline: () => "resolving a cross-team delivery problem",
    body: (facts, variant) => {
      const events = [
        `A commitment of ${facts.target} to a client is at ${facts.achievedPercent}% with ${facts.days} days left, and the delay sits between two teams that each believe the other owns it.`,
        `A decision about next month's ${facts.target} commitment has been reopened three times and the deadline is in ${facts.days} days.`,
        `A new process was announced but two teams are still working the old way, and ${facts.target} of committed orders no longer reconciles with the monthly report.`,
      ];
      return [
        `You are the ${facts.role} at ${facts.company}. ${TEAM_LINE(facts)} ${events[variant % events.length]}`,
        `You have no direct authority over one of the teams, the budget is fixed, and the client expects an update in ${facts.days} days.`,
      ].join("\n\n");
    },
    deliverable:
      "Write your plan: how you would establish the facts, who you would involve and in what order, the decision you would take, how you would keep the commitment or renegotiate it, and how you would stop the same problem recurring. At most 450 words.",
    criteria: (facts) => [
      {
        name: "Situation and stakeholders",
        description: "Names the facts, the parties and what each needs.",
        maxMarks: 20,
        privateGuidance:
          "Strong answers separate fact from assumption, name the two teams and their incentives, and note the client's expectation. Weak answers describe the problem only in general terms.",
      },
      {
        name: "Reasoning and approach",
        description: "A sequenced approach rather than a list of activities.",
        maxMarks: 30,
        privateGuidance:
          "Strong answers sequence fact-finding, a decision forum, and a commitment, and explain why the order matters. Weak answers list meetings to hold.",
      },
      {
        name: "Specific actions",
        description: "Concrete actions with owners, not intentions.",
        maxMarks: 25,
        privateGuidance:
          "Strong answers name who does what by when, including the cross-team ask. Weak answers use 'align', 'coordinate', 'communicate'.",
      },
      {
        name: "Constraints and risks",
        description: "Handles the lack of authority and the fixed budget.",
        maxMarks: 15,
        privateGuidance:
          "Strong answers use escalation, a written decision record and trade-offs instead of authority. Weak answers assume compliance.",
      },
      {
        name: "Communication",
        description: "What is said to the client and to both teams.",
        maxMarks: 10,
        privateGuidance:
          "Strong answers give the client a dated update and keep internal messages consistent. Weak answers leave the client uninformed.",
      },
    ],
    keyFacts: (facts) => [
      `Commitment ${facts.target} at ${facts.achievedPercent}%`,
      `${facts.days} days remaining`,
      "No direct authority over one team",
      "Budget fixed",
    ],
    redFlags: ["Relies on authority", "Vague verbs", "Client left without an update"],
  },
};

export type ScenarioTask = {
  family: SkillFamily;
  title: string;
  prompt: string;
  publicData: Record<string, unknown>;
  privateData: Record<string, unknown>;
  rubric: Criterion[];
  facts: ScenarioFacts;
};

/**
 * Builds a specific, fact-carrying task for a skill. Deterministic for a given seed and brief.
 */
export function buildScenarioTask(input: {
  seed: number;
  skillSlug: string;
  skillName: string;
  jobTitle?: string;
  companyName?: string;
  requirementsText?: string;
  level?: string;
  difficulty?: string;
}): ScenarioTask {
  const family = detectFamily(input.skillSlug, input.skillName, input.requirementsText ?? "");
  const facts = readScenarioFacts({
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    requirementsText: input.requirementsText,
    level: input.level,
    seed: input.seed,
    family,
  });
  const template = TEMPLATES[family];
  const variant = seeded(input.seed, 7) % 3;
  const headline = template.headline(facts);
  const title = `${input.skillName}: ${headline}`.slice(0, 120);
  const prompt = `${template.body(facts, variant)}\n\n${template.deliverable}`;

  return {
    family,
    title,
    // The scenario always ends with an explicit deliverable, so the instruction is never vague.
    prompt,
    publicData: { wordLimit: 500 },
    privateData: {
      evaluation: "RUBRIC_REVIEW",
      keyFacts: template.keyFacts(facts),
      redFlags: template.redFlags,
      strongAnswerSignals: template.criteria(facts).map((criterion) => criterion.name),
    },
    rubric: template.criteria(facts),
    facts,
  };
}

export type PracticeDrill = {
  family: SkillFamily;
  title: string;
  scenario: string;
  steps: string[];
  minutes: number;
};

// Practice has no recruiter-supplied role, so the drill names the work instead of inventing a title.
const PRACTICE_ROLE: Record<SkillFamily, string> = {
  SALES: "sales lead",
  SERVICE: "client services lead",
  OPERATIONS: "operations lead",
  DATA: "analyst",
  PEOPLE: "team lead",
  FINANCE: "finance analyst",
  MARKETING: "marketing lead",
  CREATIVE: "designer",
  TECHNICAL: "engineer",
  GENERAL: "project lead",
};

const PRACTICE_STEPS: Record<SkillFamily, string[]> = {
  SALES: [
    "Write the three numbers you would check before the call.",
    "Draft the opening two sentences that name the problem without blaming anyone.",
    "List the two concessions you would offer and the one you would refuse.",
  ],
  SERVICE: [
    "Write the first paragraph of the reply in under 60 words.",
    "Name the one internal person who owns the fix and the date you promise.",
    "Write the sentence that tells the customer what stops this recurring.",
  ],
  OPERATIONS: [
    "Work out what is recoverable at the capped daily rate and write the residual gap.",
    "Order three actions by dependency, not by importance.",
    "Write the one metric you would check mid-week.",
  ],
  DATA: [
    "Write the question as a number with a baseline and a comparison.",
    "List two checks you would run before trusting the result.",
    "Write the recommendation in one sentence with its expected effect.",
  ],
  PEOPLE: [
    "Write the first sentence of the conversation, without a judgement.",
    "Name the work you would take off the team this week.",
    "Write the measure and the date of the next review.",
  ],
  FINANCE: [
    "Split the variance into committed and discretionary spend.",
    "Write two options with their value and their service impact.",
    "Name the control that keeps the reforecast honest.",
  ],
  MARKETING: [
    "Write the audience, the trigger and the objection in one line each.",
    "Choose two channels and say what each is for.",
    "Write the qualified-lead threshold and the cost per lead you would accept.",
  ],
  CREATIVE: [
    "Write the one message the work has to land, in a sentence.",
    "Describe the key image and the three crops in plain words.",
    "Name what you would cut first and why.",
  ],
  TECHNICAL: [
    "Write the reproduction steps and the one hypothesis you would test first.",
    "Name the smallest safe change you would ship today.",
    "Write the rollback trigger.",
  ],
  GENERAL: [
    "Write the facts you can prove and the assumptions you cannot.",
    "List the people you would speak to and the order.",
    "Write the client update in three sentences.",
  ],
};

/**
 * A short daily practice drill for a skill. Deliberately unmarked: tasks build the habit,
 * assessments measure it.
 */
export function buildPracticeDrill(input: {
  seed: number;
  skillSlug: string;
  skillName: string;
  jobTitle?: string;
  requirementsText?: string;
}): PracticeDrill {
  const family = detectFamily(input.skillSlug, input.skillName, input.requirementsText ?? "");
  const facts = readScenarioFacts({
    jobTitle: input.jobTitle?.trim() || PRACTICE_ROLE[family],
    requirementsText: input.requirementsText,
    seed: input.seed,
    family,
  });
  const template = TEMPLATES[family];
  const variant = seeded(input.seed, 11) % 3;
  const body = template.body(facts, variant)
    .split("\n\n")
    .slice(0, 2)
    .join(" ");

  return {
    family,
    title: `${input.skillName}: ${template.headline(facts)}`.slice(0, 120),
    scenario: body,
    steps: PRACTICE_STEPS[family],
    minutes: 10 + (seeded(input.seed, 13) % 6),
  };
}
