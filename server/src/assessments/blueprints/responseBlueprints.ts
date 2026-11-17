/**
 * Response blueprint builders for STRUCTURED_RESPONSE assessment tasks.
 * Pure TypeScript — no database, no routes, no new dependencies.
 */

import { mulberry32 } from "../dataTasks.js";
import type { BlueprintContext, BlueprintTask, BlueprintCriterion, StructuredResponseBlueprint } from "./types.js";

/**
 * Helper: safe company name
 */
function company(ctx: BlueprintContext): string {
  return ctx.companyName?.trim() || "the company";
}

/**
 * Builder 1: Client Communication Task
 * Type: STRUCTURED_RESPONSE, timeWeight: 2, isGeneric: false
 */
export function buildClientCommunicationTask(ctx: BlueprintContext): BlueprintTask {
  const rand = mulberry32(ctx.seed);

  // Pools
  const clients = [
    { name: "Rahul Mehta", org: "Mehta Interiors" },
    { name: "Sana Iqbal", org: "Iqbal Hardware" },
    { name: "Vikram Rao", org: "Rao Constructions" },
    { name: "Lakshmi Hegde", org: "Hegde Agro Supplies" },
  ];
  const delayDays = [3, 4, 5, 6];
  const causes = [
    "a breakdown at the supplier's warehouse",
    "a regional transport strike",
    "a customs hold on one imported item",
  ];
  const orderValues = [185000, 240000, 320000, 410000];
  const readyShares = [50, 60, 70];

  // Pick random entries
  const client = clients[Math.floor(rand() * clients.length)];
  const delay = delayDays[Math.floor(rand() * delayDays.length)];
  const cause = causes[Math.floor(rand() * causes.length)];
  const orderValue = orderValues[Math.floor(rand() * orderValues.length)];
  const readyShare = readyShares[Math.floor(rand() * readyShares.length)];
  const orderRef = `ORD-${1000 + Math.floor(rand() * 9000)}`;

  // Scenario
  const scenario = `The delivery promised for Friday will arrive ${delay} working days late because of ${cause}; ${readyShare}% of the items can ship now.`;

  // Client message (2-3 sentences, angry tone)
  const clientMessage = `We were counting on this delivery for Friday and now you're telling us it's delayed? This is completely unacceptable — our project timeline depends on these materials. What exactly is happening and what are you going to do about it?`;

  // Difficulty complications
  let complication = "";
  if (ctx.difficulty === "INTERMEDIATE" || ctx.difficulty === "ADVANCED") {
    complication = " The exact new date is not yet confirmed; the supplier has promised an update by Thursday noon.";
  }
  if (ctx.difficulty === "ADVANCED") {
    complication += " Your manager has told you not to offer discounts or free shipping.";
  }

  const prompt = `You are a sales coordinator at ${company(ctx)}. ${scenario}${complication}

Below is the message you received from the client:

"${clientMessage}"

Write a reply email of at most 250 words.`;

  // publicData
  const publicData = {
    scenario: {
      orderRef,
      clientName: client.name,
      clientOrg: client.org,
      orderValueInr: orderValue,
      facts: [
        `Delivery promised for Friday`,
        `Now arriving ${delay} working days late`,
        `Cause: ${cause}`,
        `${readyShare}% of items can ship now`,
        `Order value: INR ${orderValue.toLocaleString("en-IN")}`,
        `Order reference: ${orderRef}`,
      ],
    },
    clientMessage,
    wordLimit: 250,
    deliverable: "A reply email",
  };

  // keyFacts and redFlags for privateData
  const keyFacts = [
    `Order ${orderRef} for ${client.name} at ${client.org}`,
    `Value: INR ${orderValue.toLocaleString("en-IN")}`,
    `Delay: ${delay} working days due to ${cause}`,
    `${readyShare}% available for immediate shipment`,
  ];

  const redFlags = [
    "Blaming the supplier without taking ownership",
    "Making promises about dates not yet confirmed",
    "Offering discounts or free shipping when not authorized",
    "Ignoring the client's emotional concern",
    "Vague or missing next steps",
  ];

  // Rubric with weights summing to 100
  const rubric: BlueprintCriterion[] = [
    {
      name: "Acknowledges the problem and the client's concern",
      description: "Shows you understand the delay and the client's frustration.",
      maxMarks: 20,
      privateGuidance: "Strong answers explicitly name the delay and validate the client's frustration in the first paragraph. Weak answers dive straight into facts without acknowledging the emotion, or use generic apologies like 'sorry for the inconvenience' without specificity.",
    },
    {
      name: "States the facts clearly (what, why, new timing)",
      description: "Communicates the delay, cause, partial availability, and next update clearly.",
      maxMarks: 25,
      privateGuidance: "Strong answers state all four facts: (1) Friday delivery delayed by X working days, (2) the specific cause, (3) Y% can ship now, (4) supplier update expected by Thursday noon (for INTERMEDIATE/ADVANCED). Weak answers omit the cause, omit the ready-share %, or present the new date as certain when it is not.",
    },
    {
      name: "Offers a practical way forward",
      description: "Proposes a concrete next step the client can act on.",
      maxMarks: 25,
      privateGuidance: "Strong answers offer a specific action: immediate partial shipment, a follow-up date, a named point of contact, or a revised schedule. Weak answers say 'we will update you' without a when or how, or suggest escalation without a path.",
    },
    {
      name: "Professional, calm tone and structure",
      description: "Email is well-structured, polite, and free of defensive language.",
      maxMarks: 15,
      privateGuidance: "Strong answers use a clear greeting, short paragraphs, a specific closing, and no blame-shifting. Weak answers use all caps, exclamation marks, defensive phrases ('not our fault'), or ramble without structure.",
    },
    {
      name: "Honest, no over-promising",
      description: "Does not guarantee dates or outcomes that are not certain.",
      maxMarks: 15,
      privateGuidance: "Strong answers say 'supplier expects update by Thursday' rather than 'will arrive by X date'. Weak answers state a firm new delivery date, promise the full order will ship early, or imply the delay is resolved when it is not.",
    },
  ];

  const privateData = {
    evaluation: "RUBRIC_REVIEW" as const,
    keyFacts,
    redFlags,
  };

  return {
    type: "STRUCTURED_RESPONSE",
    skillSlug: ctx.skillSlug,
    title: "Reply to a client about a delayed delivery",
    prompt,
    marks: 100,
    timeMinutes: 20, // timeWeight 2 ≈ 20 min base
    publicData,
    privateData,
    rubric,
    isGeneric: false,
    timeWeight: 2,
  } as StructuredResponseBlueprint;
}

/**
 * Builder 2: Negotiation Task
 * Type: STRUCTURED_RESPONSE, timeWeight: 2, isGeneric: false
 */
export function buildNegotiationTask(ctx: BlueprintContext): BlueprintTask {
  const rand = mulberry32(ctx.seed);

  // Pools
  const suppliers = ["Kaveri Steel Traders", "Sahyadri Packaging", "Malnad Components", "Netravathi Plastics"];
  const increasePcts = [12, 15, 18];
  const monthlySpends = [400000, 550000, 750000];
  const relationshipYears = [2, 3, 4];
  const absorbPcts = [4, 5, 6];

  const supplier = suppliers[Math.floor(rand() * suppliers.length)];
  const increasePct = increasePcts[Math.floor(rand() * increasePcts.length)];
  const monthlySpend = monthlySpends[Math.floor(rand() * monthlySpends.length)];
  const relYears = relationshipYears[Math.floor(rand() * relationshipYears.length)];
  const absorbPct = absorbPcts[Math.floor(rand() * absorbPcts.length)];

  // Scenario
  const scenario = `Your supplier ${supplier} announced a ${increasePct}% price increase effective in 5 days, citing raw-material costs. You spend INR ${monthlySpend.toLocaleString("en-IN")} per month with them, have worked together for ${relYears} years, and your budget can absorb at most ${absorbPct}%.`;

  // Difficulty extras
  let extra = "";
  if (ctx.difficulty === "INTERMEDIATE" || ctx.difficulty === "ADVANCED") {
    extra = " You have a competing quote about 8% above your current price, but switching would take about 6 weeks.";
  }
  if (ctx.difficulty === "ADVANCED") {
    extra += " This supplier is also your only source of a certified material needed for a project that starts in 6 weeks.";
  }

  const prompt = `You are a procurement lead at ${company(ctx)}. ${scenario}${extra}

Write your response in three parts:

1. Your objective and walk-away point (2–3 lines)
2. What you would offer or trade (about 3 lines)
3. Your opening message to the supplier (at most 150 words)`;

  // publicData
  const publicData = {
    scenario: {
      supplier,
      increasePct,
      monthlySpendInr: monthlySpend,
      relationshipYears: relYears,
      absorbPct,
      facts: [
        `Supplier: ${supplier}`,
        `Announced increase: ${increasePct}% effective in 5 days`,
        `Current monthly spend: INR ${monthlySpend.toLocaleString("en-IN")}`,
        `Relationship: ${relYears} years`,
        `Budget can absorb at most: ${absorbPct}%`,
      ],
    },
    sections: [
      "Objective & walk-away point",
      "What you would offer or trade",
      "Opening message to supplier",
    ],
    wordLimit: 150,
  };

  // Strong answer signals and redFlags
  const strongAnswerSignals = [
    "Quantifies the cost impact: monthly increase vs. absorbPct limit",
    "States a clear walk-away point (e.g., 'will not accept above X%')",
    "Trades something of value: longer contract, faster payment terms, volume commitment, or multi-year agreement",
    "Proposes a specific counter-offer (e.g., 'accept Y% for 2-year contract with 15-day payment terms')",
    "Acknowledges the relationship and the certified-material dependency (ADVANCED)",
    "Opens with a collaborative tone, not an ultimatum",
  ];

  const redFlags = [
    "No walk-away point stated",
    "Accepts the full increase without negotiation",
    "Issues ultimatums or threats ('or we walk')",
    "Ignores the competing quote (INTERMEDIATE/ADVANCED)",
    "Ignores the certified-material dependency (ADVANCED)",
    "Offers nothing in trade for a lower increase",
    "Vague counter-offer ('we want a better price')",
  ];

  // Rubric with weights summing to 100
  const rubric: BlueprintCriterion[] = [
    {
      name: "Preparation and clear objectives",
      description: "States a specific target increase and a walk-away point backed by numbers.",
      maxMarks: 20,
      privateGuidance: "Strong answers calculate the monthly cost impact (INR), compare it to the absorbPct limit, and state a firm maximum they will accept. Weak answers give a vague target ('as low as possible') or no walk-away point.",
    },
    {
      name: "Understands the supplier's interests",
      description: "Shows awareness of why the supplier needs the increase and what they value.",
      maxMarks: 20,
      privateGuidance: "Strong answers reference the supplier's raw-material cost pressure, their need for cash flow or volume certainty, and (for ADVANCED) the certified-material lock-in. Weak answers treat the supplier as an adversary with no legitimate needs.",
    },
    {
      name: "Commercially sensible proposal with numbers",
      description: "Offers a concrete trade (longer contract, faster payment, volume) for a smaller increase.",
      maxMarks: 30,
      privateGuidance: "Strong answers propose a specific trade: e.g., '2-year contract at +6% with 15-day payment terms' or '+8% with 30% volume increase committed'. They quantify the impact against the absorbPct limit. Weak answers offer vague concessions ('we can pay faster') without numbers, or propose trades that cost more than the savings.",
    },
    {
      name: "Protects the relationship",
      description: "Maintains a collaborative tone and avoids burning bridges.",
      maxMarks: 15,
      privateGuidance: "Strong answers use 'we' language, acknowledge the partnership, and frame the negotiation as a joint problem. Weak answers use adversarial language, threaten immediate switching, or imply the supplier is acting in bad faith.",
    },
    {
      name: "Clear, professional message",
      description: "Opening message is concise, structured, and under 150 words.",
      maxMarks: 15,
      privateGuidance: "Strong answers have a clear subject line, reference the relationship, state the concern factually, propose the trade, and close with a next step — all within 150 words. Weak answers ramble, exceed the word limit, omit the proposal, or sound emotional.",
    },
  ];

  const privateData = {
    evaluation: "RUBRIC_REVIEW" as const,
    strongAnswerSignals,
    redFlags,
  };

  return {
    type: "STRUCTURED_RESPONSE",
    skillSlug: ctx.skillSlug,
    title: "Negotiate a supplier price increase",
    prompt,
    marks: 100,
    timeMinutes: 20, // timeWeight 2 ≈ 20 min base
    publicData,
    privateData,
    rubric,
    isGeneric: false,
    timeWeight: 2,
  } as StructuredResponseBlueprint;
}

/**
 * Builder 3: Drawing Interpretation Task
 * Type: STRUCTURED_RESPONSE, timeWeight: 2, isGeneric: false
 */
export function buildDrawingInterpretationTask(ctx: BlueprintContext): BlueprintTask {
  const rand = mulberry32(ctx.seed);

  // Seeded discrepancy pairs
  const wallThicknessPairs = [[230, 150], [230, 115], [200, 150]];
  const doorCountPairs = [[3, 2], [4, 3], [2, 3]];
  const slabThicknessPairs = [[125, 150], [150, 125]];
  const windowCounts = [2, 3, 4];

  const wallPair = wallThicknessPairs[Math.floor(rand() * wallThicknessPairs.length)];
  const doorPair = doorCountPairs[Math.floor(rand() * doorCountPairs.length)];
  const slabPair = slabThicknessPairs[Math.floor(rand() * slabThicknessPairs.length)];
  const windowCount = windowCounts[Math.floor(rand() * windowCounts.length)];

  // Three extracts
  const extracts = [
    {
      sheet: "A-101",
      title: "Floor plan",
      notes: [
        `External wall thickness: ${wallPair[0]} mm`,
        `Door D1 count: ${doorPair[0]}`,
        `Window W1 count: ${windowCount}`,
        `Ceiling height: 3.0 m`,
        "Door schedule: D1 × " + doorPair[1] + " (single leaf, 900 mm)",
      ],
    },
    {
      sheet: "A-201",
      title: "Section",
      notes: [
        `External wall thickness: ${wallPair[1]} mm`,
        `Slab thickness: ${slabPair[0]} mm`,
        `Window W1 count: ${windowCount}`,
        `Ceiling height: 3.0 m`,
      ],
    },
    {
      sheet: "S-101",
      title: "Structural notes",
      notes: [
        `Slab thickness: ${slabPair[1]} mm`,
        "Concrete grade: M25",
        "Reinforcement: Fe500",
      ],
    },
  ];

  // Planted discrepancies (for privateData)
  const plantedDiscrepancies = [
    {
      topic: "Wall thickness",
      sheets: ["A-101", "A-201"],
      values: [wallPair[0], wallPair[1]],
    },
    {
      topic: "Door D1 count",
      sheets: ["A-101 (floor plan)", "A-101 (door schedule)"],
      values: [doorPair[0], doorPair[1]],
    },
    {
      topic: "Slab thickness",
      sheets: ["A-201", "S-101"],
      values: [slabPair[0], slabPair[1]],
    },
  ];

  const consistentItems = [
    `Window W1 count: ${windowCount} (consistent on A-101 and A-201)`,
    "Ceiling height: 3.0 m (consistent on A-101 and A-201)",
  ];

  // Task instructions
  let extraInstruction = "";
  if (ctx.difficulty === "ADVANCED") {
    extraInstruction = "\n\nAlso rank the discrepancies by cost risk.";
  }

  const prompt = `You are a site engineer at ${company(ctx)} reviewing drawing extracts before placing a material order. The extracts below may contain inconsistencies.

Extracts:

${extracts.map((e) => `Sheet ${e.sheet} — ${e.title}:\n${e.notes.map((n) => `- ${n}`).join("\n")}`).join("\n\n")}

Task: List every inconsistency you find. For each, state which sheets disagree and what the conflicting values are. Then state what you would do before ordering any material.${extraInstruction}`;

  // publicData
  const publicData = {
    extracts,
    instructions: "List every inconsistency, say which sheets disagree, and say what you would do before ordering any material." + (ctx.difficulty === "ADVANCED" ? " Also rank the discrepancies by cost risk." : ""),
  };

  // Rubric with weights summing to 100
  const rubric: BlueprintCriterion[] = [
    {
      name: "Finds the wall thickness discrepancy",
      description: "Identifies that A-101 and A-201 show different external wall thicknesses.",
      maxMarks: 25,
      privateGuidance: `Strong answers explicitly state: "A-101 shows ${wallPair[0]} mm, A-201 shows ${wallPair[1]} mm." Weak answers miss this entirely or confuse it with the door schedule.`,
    },
    {
      name: "Finds the door count discrepancy",
      description: "Identifies that A-101 floor plan and its door schedule show different counts for door D1.",
      maxMarks: 20,
      privateGuidance: `Strong answers explicitly state: "Floor plan shows D1 × ${doorPair[0]}, door schedule shows D1 × ${doorPair[1]}." Weak answers miss the door schedule or report the floor plan count only.`,
    },
    {
      name: "Finds the slab thickness discrepancy",
      description: "Identifies that A-201 and S-101 show different slab thicknesses.",
      maxMarks: 20,
      privateGuidance: `Strong answers explicitly state: "A-201 shows ${slabPair[0]} mm, S-101 shows ${slabPair[1]} mm." Weak answers miss this or confuse it with wall thickness.`,
    },
    {
      name: "Does not report consistent items as errors",
      description: "Correctly notes that window W1 count and ceiling height are consistent across sheets.",
      maxMarks: 10,
      privateGuidance: "Strong answers explicitly state these are consistent and not errors. Weak answers either flag them as discrepancies or say nothing about them (ambiguous).",
    },
    {
      name: "Proposes sensible verification before ordering",
      description: "Recommends a practical next step: RFI to architect, clarification with structural engineer, or on-site verification.",
      maxMarks: 25,
      privateGuidance: "Strong answers name a specific action: 'Raise RFI to architect for wall thickness and slab thickness; clarify door schedule with architect; verify window count on site.' Weak answers say 'check with someone' without naming who or what, or suggest ordering extra material 'just in case' without resolving the conflict.",
    },
  ];

  const privateData = {
    evaluation: "RUBRIC_REVIEW" as const,
    plantedDiscrepancies,
    consistentItems,
  };

  return {
    type: "STRUCTURED_RESPONSE",
    skillSlug: ctx.skillSlug,
    title: "Check the drawings before ordering",
    prompt,
    marks: 100,
    timeMinutes: 20, // timeWeight 2 ≈ 20 min base
    publicData,
    privateData,
    rubric,
    isGeneric: false,
    timeWeight: 2,
  } as StructuredResponseBlueprint;
}