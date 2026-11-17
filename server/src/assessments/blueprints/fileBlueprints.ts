/**
 * File submission blueprint builders for FILE_SUBMISSION assessment tasks.
 * Pure TypeScript — no database, no routes, no new dependencies.
 */

import { mulberry32 } from "../dataTasks.js";
import type { BlueprintContext, BlueprintTask, BlueprintCriterion, FileSubmissionBlueprint } from "./types.js";

/**
 * Helper: safe company name
 */
function company(ctx: BlueprintContext): string {
  return ctx.companyName?.trim() || "the company";
}

/**
 * Builder 4: AutoCAD Task
 * Type: FILE_SUBMISSION, timeWeight: 3, isGeneric: false
 */
export function buildAutoCadTask(ctx: BlueprintContext): BlueprintTask {
  const rand = mulberry32(ctx.seed);

  // Pools
  const internalSizes = [
    [6.0, 4.0],
    [5.0, 4.0],
    [6.0, 3.5],
  ];
  const doorWidths = [0.9, 1.0];
  const windowWidths = [1.2, 1.5];

  const size = internalSizes[Math.floor(rand() * internalSizes.length)];
  const doorWidth = doorWidths[Math.floor(rand() * doorWidths.length)];
  const windowWidth = windowWidths[Math.floor(rand() * windowWidths.length)];

  const [length, width] = size;

  // Brief
  const brief = `Draw a single-room site office with internal dimensions ${length} m × ${width} m. External walls are 230 mm thick. One door (${doorWidth} m wide) in a short wall. Two windows (${windowWidth} m wide each), one in each long wall. Scale 1:50.`;

  // Requirements
  const requirements = [
    "Layers named WALLS, DOORS, WINDOWS, DIMENSIONS, TEXT",
    "Overall internal dimensions and wall thickness dimensioned",
    `Door and window dimensions shown (${ctx.difficulty === "BEGINNER" ? "not required for BEGINNER" : "required for INTERMEDIATE and ADVANCED"})`,
    "A title block with project name, drawn by, date, and scale",
    "Plot to PDF",
  ];

  if (ctx.difficulty === "ADVANCED") {
    requirements.push("Door swing arc shown");
    requirements.push("North arrow included");
  }

  // Deliverables
  const deliverables = [
    { label: "Drawing file", accept: [".dwg"] },
    { label: "PDF plot", accept: [".pdf"] },
  ];

  // Expected sizes for reviewer
  const expected = {
    internalLength: length,
    internalWidth: width,
    wallThickness: 0.23,
    doorWidth,
    windowWidth,
    scale: "1:50",
  };

  // Review checklist
  const reviewChecklist = [
    `Room internal dimensions: ${length}m × ${width}m`,
    "Wall thickness: 230 mm",
    `Door: ${doorWidth} m wide in short wall`,
    `Windows: 2 × ${windowWidth} m in long walls`,
    "Layers: WALLS, DOORS, WINDOWS, DIMENSIONS, TEXT",
    "Internal dimensions dimensioned",
    "Wall thickness dimensioned",
    ctx.difficulty !== "BEGINNER" ? "Door/window dimensions dimensioned" : "Door/window dimensions not required (BEGINNER)",
    "Title block: project name, drawn by, date, scale 1:50",
    "PDF plot matches drawing",
    ctx.difficulty === "ADVANCED" ? "Door swing arc shown" : "Door swing arc not required",
    ctx.difficulty === "ADVANCED" ? "North arrow included" : "North arrow not required",
  ].filter(Boolean) as string[];

  const prompt = `You are a site engineer at ${company(ctx)} preparing a drawing for a site office.

${brief}

Requirements:
${requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Deliverables:
${deliverables.map((d) => `- ${d.label}: ${d.accept.join(", ")}`).join("\n")}`;

  // publicData
  const publicData = {
    brief,
    requirements,
    deliverables,
    maxFileMB: 10,
    evaluationNote: "A reviewer will check your files against the criteria below. There is no automatic CAD checking.",
  };

  // Rubric with weights summing to 100
  const rubric: BlueprintCriterion[] = [
    {
      name: "Geometry matches the brief",
      description: "Room dimensions, wall thickness, door and window placement and sizes match the brief.",
      maxMarks: 30,
      privateGuidance: `Strong answers: room exactly ${length}m × ${width}m internal, 230 mm walls, door ${doorWidth}m in short wall, two windows ${windowWidth}m in long walls. Weak answers: wrong dimensions, missing door/window, wrong wall thickness, door in long wall.`,
    },
    {
      name: "Layers and organisation",
      description: "Objects are on correct layers (WALLS, DOORS, WINDOWS, DIMENSIONS, TEXT).",
      maxMarks: 20,
      privateGuidance: "Strong answers use all five named layers correctly; walls on WALLS, doors on DOORS, etc. Weak answers put everything on layer 0, use wrong layer names, or have disorganized layer structure.",
    },
    {
      name: "Dimensions and annotation",
      description: "Required dimensions are present and correctly placed.",
      maxMarks: 20,
      privateGuidance: `Strong answers: overall internal length and width dimensioned, wall thickness dimensioned, ${ctx.difficulty !== "BEGINNER" ? "door and window dimensions dimensioned" : "door/window dimensions optional for BEGINNER"}. Weak answers: missing dimensions, dimension lines overlapping geometry, wrong dimension values.`,
    },
    {
      name: "Title block and plot output",
      description: "Title block has project name, drawn by, date, scale; PDF plots correctly.",
      maxMarks: 15,
      privateGuidance: "Strong answers: complete title block, PDF is readable at 1:50, no clipped content. Weak answers: missing title block fields, PDF not to scale, clipped edges.",
    },
    {
      name: "Completeness against the brief",
      description: "All brief requirements are met; ADVANCED items included if applicable.",
      maxMarks: 15,
      privateGuidance: `Strong answers meet all requirements including ${ctx.difficulty === "ADVANCED" ? "door swing arc and north arrow" : ctx.difficulty === "INTERMEDIATE" ? "door/window dimensions" : "base requirements only"}. Weak answers miss one or more requirements.`,
    },
  ];

  const privateData = {
    evaluation: "HUMAN_REVIEW" as const,
    reviewChecklist,
    expected,
  };

  return {
    type: "FILE_SUBMISSION",
    skillSlug: ctx.skillSlug,
    title: "Draw a site office floor plan",
    prompt,
    marks: 100,
    timeMinutes: 30, // timeWeight 3 ≈ 30 min base
    publicData,
    privateData,
    rubric,
    isGeneric: false,
    timeWeight: 3,
  } as FileSubmissionBlueprint;
}

/**
 * Builder 5: Generic File Task
 * Type: FILE_SUBMISSION, timeWeight: 3, isGeneric: true
 */
export function buildGenericFileTask(ctx: BlueprintContext): BlueprintTask {
  const skillName = ctx.skillName?.trim() || "the skill";
  const jobTitle = ctx.jobTitle?.trim() || "the role";
  const companyName = company(ctx);

  const prompt = `Prepare a short work sample that demonstrates ${skillName} for a ${jobTitle} role at ${companyName}. Upload your file and add 3–5 sentences explaining what you did and why.`;

  const deliverables = [
    { label: "Work sample", accept: [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".zip"] },
  ];

  const requirements = [
    "File demonstrates the skill for the stated role and company",
    "File is in an accepted format",
    "Explanation (3–5 sentences) covers what you did and why",
  ];

  const publicData = {
    brief: prompt,
    requirements,
    deliverables,
    maxFileMB: 10,
    evaluationNote: "A reviewer will check your files against the criteria below. There is no automatic checking.",
  };

  // Rubric with weights summing to 100
  const rubric: BlueprintCriterion[] = [
    {
      name: "Meets the brief",
      description: "The work sample clearly demonstrates the named skill for the stated role.",
      maxMarks: 30,
      privateGuidance: "Strong answers: file directly shows the skill in a context relevant to the job title and company. Weak answers: generic portfolio piece, wrong skill, no connection to the role.",
    },
    {
      name: "Technical quality",
      description: "The work sample shows competent, correct application of the skill.",
      maxMarks: 30,
      privateGuidance: "Strong answers: technically accurate, follows best practices, no obvious errors. Weak answers: factual errors, poor technique, incomplete work.",
    },
    {
      name: "Organisation and presentation",
      description: "The file is well-structured, named clearly, and easy to navigate.",
      maxMarks: 20,
      privateGuidance: "Strong answers: logical structure, clear naming, readable layout. Weak answers: disorganized, unclear file names, hard to follow.",
    },
    {
      name: "Explanation of choices",
      description: "The 3–5 sentence explanation covers what was done and why.",
      maxMarks: 20,
      privateGuidance: "Strong answers: concise, specific about methods and rationale, connects to the role. Weak answers: vague, generic, missing 'why', or not 3–5 sentences.",
    },
  ];

  const privateData = {
    evaluation: "HUMAN_REVIEW" as const,
    generic: true as const,
  };

  return {
    type: "FILE_SUBMISSION",
    skillSlug: ctx.skillSlug,
    title: `${skillName}: work sample`,
    prompt,
    marks: 100,
    timeMinutes: 30, // timeWeight 3 ≈ 30 min base
    publicData,
    privateData,
    rubric,
    isGeneric: true,
    timeWeight: 3,
  } as FileSubmissionBlueprint;
}