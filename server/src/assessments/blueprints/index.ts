/**
 * Blueprint registry — central exports and task builder routing.
 * Pure TypeScript — no database, no routes, no new dependencies.
 */

export * from "./types.js";
export * from "./responseBlueprints.js";
export * from "./fileBlueprints.js";
export * from "./dataBlueprints.js";

import type { BlueprintContext, BlueprintTask, StructuredResponseBlueprint } from "./types.js";
import {
  buildSalesAnalysisTask,
  buildQuantityEstimationTask,
} from "./dataBlueprints.js";
import {
  buildClientCommunicationTask,
  buildNegotiationTask,
  buildDrawingInterpretationTask,
} from "./responseBlueprints.js";
import {
  buildAutoCadTask,
  buildGenericFileTask,
} from "./fileBlueprints.js";

/**
 * Specific builders by skill slug.
 * Returns a function that takes BlueprintContext and returns a BlueprintTask with isGeneric: false.
 */
function getSpecificBuilder(slug: string) {
  switch (slug) {
    case "excel":
    case "data-analysis":
      return (ctx: BlueprintContext) =>
        buildSalesAnalysisTask({
          context: ctx,
          targetSkillSlug: ctx.skillSlug ?? slug,
          marks: 100,
          timeMinutes: 30,
        });
    case "quantity-estimation":
      return (ctx: BlueprintContext) =>
        buildQuantityEstimationTask({
          context: ctx,
          targetSkillSlug: ctx.skillSlug ?? slug,
          marks: 100,
          timeMinutes: 25,
        });
    case "client-communication":
      return buildClientCommunicationTask;
    case "negotiation":
      return buildNegotiationTask;
    case "technical-drawing-interpretation":
      return buildDrawingInterpretationTask;
    case "autocad":
      return buildAutoCadTask;
    default:
      return null;
  }
}

/**
 * Check if a skill slug has a specific (non-generic) blueprint registered.
 */
export function hasSpecificBlueprint(slug: string): boolean {
  return getSpecificBuilder(slug) !== null;
}

export { getSpecificBuilder };

/**
 * Build a generic task for any skill.
 * The type is determined by the skill's first assessment type.
 * Every generic task has isGeneric: true.
 */
export function buildGenericTask(ctx: BlueprintContext): BlueprintTask {
  const assessmentType = ctx.skill?.assessmentTypes?.[0] ?? "STRUCTURED_RESPONSE";

  switch (assessmentType) {
    case "STRUCTURED_RESPONSE": {
      const skillName = ctx.skillName?.trim() || "the skill";
      const jobTitle = ctx.jobTitle?.trim() || "the role";
      const companyName = ctx.companyName?.trim() || "the company";

      const prompt = `You are a ${jobTitle} at ${companyName}. A realistic situation arises that requires ${skillName}. Explain, step by step, how you would handle it. Be specific about the actions you would take, the people you would involve, and the information you would need. Write at most 300 words.`;

      const rubric = [
        {
          name: "Understands the situation",
          description: "Shows clear grasp of the scenario and its constraints.",
          maxMarks: 25,
          privateGuidance: "Strong answers restate the problem in their own words, identify stakeholders, and note key constraints. Weak answers dive into solutions without showing they understood the situation.",
        },
        {
          name: "Quality of reasoning and approach",
          description: "Logical, structured reasoning with a practical methodology.",
          maxMarks: 30,
          privateGuidance: "Strong answers use a clear framework (e.g., gather info → analyze → decide → act → follow up), justify each step, and anticipate risks. Weak answers are a list of actions without reasoning, or jump to a solution without analysis.",
        },
        {
          name: "Practical, specific actions",
          description: "Concrete, actionable steps tied to the scenario.",
          maxMarks: 25,
          privateGuidance: "Strong answers name specific actions: 'email the vendor with these three questions,' 'pull the last three months of data,' 'schedule a 15-min call with the PM.' Weak answers use vague verbs: 'communicate,' 'analyze,' 'coordinate' without specifics.",
        },
        {
          name: "Clear communication",
          description: "Well-structured, concise, and professional writing.",
          maxMarks: 20,
          privateGuidance: "Strong answers use paragraphs, bullet points for steps, and professional tone within 300 words. Weak answers are a wall of text, exceed the word limit, or use informal language.",
        },
      ];

      return {
        type: "STRUCTURED_RESPONSE",
        skillSlug: ctx.skillSlug,
        title: `${skillName}: workplace scenario`,
        prompt,
        marks: 100,
        timeMinutes: 20,
        publicData: {
          wordLimit: 300,
        },
        privateData: {
          evaluation: "RUBRIC_REVIEW",
          generic: true,
        },
        rubric,
        isGeneric: true,
        timeWeight: 2,
      } as StructuredResponseBlueprint;
    }

    case "DATA_TASK": {
      // Reuse the sales analysis task but mark as generic
      const skillSlug = ctx.skillSlug ?? "data-skill";
      const skillName = ctx.skillName?.trim() ?? "Data Skill";
      const task = buildSalesAnalysisTask({
        context: ctx,
        targetSkillSlug: skillSlug,
        marks: 100,
        timeMinutes: 30,
      });
      return {
        ...task,
        title: `${skillName}: data task`,
        isGeneric: true,
      };
    }

    case "FILE_SUBMISSION": {
      return buildGenericFileTask(ctx);
    }

    default: {
      // Fallback to STRUCTURED_RESPONSE generic
      return buildGenericTask({
        ...ctx,
        skill: { ...ctx.skill, assessmentTypes: ["STRUCTURED_RESPONSE"] },
      });
    }
  }
}

/**
 * Build a task for a skill: specific blueprint if registered, otherwise generic.
 */
export function buildTaskForSkill(ctx: BlueprintContext): BlueprintTask {
  const slug = ctx.skillSlug ?? "";
  const builder = getSpecificBuilder(slug);
  if (builder) {
    return builder(ctx);
  }
  return buildGenericTask(ctx);
}