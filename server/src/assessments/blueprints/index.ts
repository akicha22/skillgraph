/**
 * Blueprint registry — central exports and task builder routing.
 * Pure TypeScript — no database, no routes, no new dependencies.
 */

export * from "./types.js";
export * from "./responseBlueprints.js";
export * from "./fileBlueprints.js";
export * from "./dataBlueprints.js";

import type { BlueprintContext, BlueprintTask, StructuredResponseBlueprint } from "./types.js";
import { buildScenarioTask } from "../scenarios.js";
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
      // A concrete case built from the brief: a situation, named constraints, figures and a
      // deliverable. The old "a realistic situation arises" placeholder is deliberately gone.
      const skillName = ctx.skillName?.trim() || "the skill";
      const scenario = buildScenarioTask({
        seed: ctx.seed,
        skillSlug: ctx.skillSlug ?? "general",
        skillName,
        jobTitle: ctx.jobTitle,
        companyName: ctx.companyName,
        requirementsText: ctx.requirementsText,
        level: ctx.level,
      });

      return {
        type: "STRUCTURED_RESPONSE",
        skillSlug: ctx.skillSlug ?? "general",
        title: scenario.title,
        prompt: scenario.prompt,
        marks: 100,
        timeMinutes: 20,
        publicData: scenario.publicData,
        privateData: scenario.privateData,
        rubric: scenario.rubric,
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