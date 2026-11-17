/**
 * AI assessment generation orchestration.
 *
 * Honest division of labour:
 * - The model writes wording (title, description, context, instructions, task framing).
 * - The assembler owns structure, datasets, marks, durations, rubrics and answer keys.
 * - One seed is used for both assembly passes, so the facts the model wrote about
 *   are exactly the facts that end up in the saved draft.
 * - Any provider problem falls back to template generation with a recorded reason.
 */

import { assembleAssessment } from "../assessments/assembler.js";
import { draftWordingSchema, type DraftWording, type GeneratedAssessment } from "../assessments/schema.js";
import type { Difficulty, GenerationMethod, Level } from "../assessments/constants.js";
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from "./gemini.js";
import { buildWordingPrompt, type WordingPromptInput } from "./prompt.js";
import { isAiProviderError, type AiFallback, type AiProvider } from "./types.js";

const MAX_ATTEMPTS = 2;

// Prisma client shape used by the assembler; kept loose so tests can pass a stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = any;

export type AiRuntimeConfig = {
  provider?: string | null;
  apiKey?: string | null;
  model?: string | null;
};

export type ProviderResolution = {
  provider: AiProvider | null;
  fallback: AiFallback | null;
};

export type DraftSkillInput = {
  skillSlug: string;
  weight: number;
  subskills: string[];
  source: "REQUESTED" | "SUGGESTED_APPROVED";
};

export type DraftConfig = {
  requirementsText: string;
  jobTitle?: string;
  companyName: string;
  description?: string;
  targetLevel?: Level;
  difficulty?: Difficulty;
  durationMinutes?: number;
  taskCount?: number;
  preferredAssessmentTypes?: string[];
  aiPolicy: "NOT_ALLOWED" | "ALLOWED_DISCLOSED";
  targetSkills: DraftSkillInput[];
};

export type AssessmentDraft = {
  assembled: GeneratedAssessment;
  generationMethod: GenerationMethod;
  generationModel: string | null;
  aiFallback: AiFallback | null;
};

export type WordingOutcome =
  | { ok: true; wording: DraftWording }
  | { ok: false; fallback: AiFallback };

/**
 * Resolves the configured provider. Template mode (the default) needs no key and never
 * counts as AI generation.
 */
export function resolveAiProvider(
  config: AiRuntimeConfig,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): ProviderResolution {
  const name = (config.provider ?? "template").trim().toLowerCase();
  if (name === "" || name === "template") return { provider: null, fallback: null };

  if (name !== "gemini") {
    return {
      provider: null,
      fallback: {
        code: "NOT_CONFIGURED",
        message: `Unknown AI_PROVIDER "${config.provider}". Use "template" or "gemini".`,
      },
    };
  }

  const apiKey = (config.apiKey ?? "").trim();
  if (!apiKey) {
    return {
      provider: null,
      fallback: {
        code: "NOT_CONFIGURED",
        message: "AI_PROVIDER is set to gemini but GEMINI_API_KEY is empty on the server.",
      },
    };
  }

  try {
    const provider = createGeminiProvider({
      apiKey,
      model: config.model ?? DEFAULT_GEMINI_MODEL,
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
    });
    return { provider, fallback: null };
  } catch (err) {
    return { provider: null, fallback: toFallback(err) };
  }
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (!issue) return "the reply did not match the expected shape";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export type WordingParseResult = { ok: true; wording: DraftWording } | { ok: false; reason: string };

/**
 * Parses and validates model output. Unknown skill slugs are rejected because the
 * wording must map onto skills the recruiter actually approved.
 */
export function parseWording(raw: string, allowedSkillSlugs: Set<string>): WordingParseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonFences(raw));
  } catch {
    return { ok: false, reason: "the reply was not valid JSON" };
  }

  const parsed = draftWordingSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: firstIssue(parsed.error) };

  const unknown = parsed.data.tasks.map((t) => t.skillSlug).filter((slug) => !allowedSkillSlugs.has(slug));
  if (unknown.length > 0) {
    return { ok: false, reason: `unknown skill slug(s): ${[...new Set(unknown)].join(", ")}` };
  }

  return { ok: true, wording: parsed.data };
}

function toFallback(err: unknown): AiFallback {
  if (isAiProviderError(err)) return { code: err.code, message: err.message };
  if (err instanceof Error && err.message) {
    return { code: "BAD_RESPONSE", message: err.message };
  }
  return { code: "BAD_RESPONSE", message: "Gemini could not be used for this request." };
}

function isRetryable(err: unknown): boolean {
  return isAiProviderError(err) && err.retryable;
}

/**
 * Asks the provider for wording. Retries once on transport/quota failures and once on
 * invalid output (with the validation reason fed back), then gives up so the caller
 * can fall back honestly.
 */
export async function requestWording(
  input: WordingPromptInput,
  provider: AiProvider,
  deps: { signal?: AbortSignal } = {},
): Promise<WordingOutcome> {
  const { system, user } = buildWordingPrompt(input);
  const allowed = new Set(input.skills.map((s) => s.skillSlug));
  let lastFallback: AiFallback | null = null;
  let repairNote: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userPrompt = repairNote ? `${user}\n\n${repairNote}` : user;

    let raw: string;
    try {
      raw = await provider.generateJson({ system, user: userPrompt }, deps.signal);
    } catch (err) {
      lastFallback = toFallback(err);
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) return { ok: false, fallback: lastFallback };
      continue;
    }

    const parsed = parseWording(raw, allowed);
    if (parsed.ok) return { ok: true, wording: parsed.wording };

    lastFallback = {
      code: "INVALID_OUTPUT",
      message: `Gemini returned wording that failed validation (${parsed.reason}).`,
    };
    repairNote = `Your previous reply was rejected: ${parsed.reason}. Return only the JSON object in the exact shape required, with no other text.`;
  }

  return {
    ok: false,
    fallback: lastFallback ?? { code: "INVALID_OUTPUT", message: "Gemini did not return usable wording." },
  };
}

function defaultTitle(config: DraftConfig): string {
  return config.jobTitle?.trim() || "Assessment";
}

/**
 * Produces a complete, validated draft assessment.
 *
 * Pass 1 assembles the deterministic outline (real datasets and facts). When a provider
 * is available its wording is validated and merged in pass 2 with the same seed; otherwise
 * the outline is returned as an honestly-labelled template draft.
 */
export async function generateAssessmentDraft(
  config: DraftConfig,
  deps: {
    prisma: PrismaLike;
    ai?: AiRuntimeConfig;
    /** Explicit provider for tests. `null` forces template mode. */
    provider?: AiProvider | null;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    /** Injectable clock so the seed is reproducible in tests. */
    now?: () => number;
  },
): Promise<AssessmentDraft> {
  const seed = (deps.now ?? Date.now)();

  const outline = await assembleAssessment({ ...config, seed }, deps.prisma);

  let provider: AiProvider | null = null;
  let resolutionFallback: AiFallback | null = null;

  if (deps.provider !== undefined) {
    provider = deps.provider;
  } else {
    const resolution = resolveAiProvider(deps.ai ?? {}, { fetchImpl: deps.fetchImpl });
    provider = resolution.provider;
    resolutionFallback = resolution.fallback;
  }

  if (!provider) {
    return {
      assembled: outline,
      generationMethod: "TEMPLATE",
      generationModel: null,
      aiFallback: resolutionFallback ? withTemplateSuffix(resolutionFallback) : null,
    };
  }

  const skillRows: { slug: string; name: string; subskills: { slug: string; name: string }[] }[] =
    await deps.prisma.skill.findMany({
      where: { slug: { in: config.targetSkills.map((s) => s.skillSlug) } },
      select: { slug: true, name: true, subskills: { select: { slug: true, name: true } } },
    });
  const skillRowBySlug = new Map(skillRows.map((row) => [row.slug, row]));

  const promptInput: WordingPromptInput = {
    requirementsText: config.requirementsText,
    jobTitle: defaultTitle(config),
    companyName: config.companyName,
    description: config.description,
    targetLevel: config.targetLevel ?? "FRESHER",
    difficulty: config.difficulty ?? "INTERMEDIATE",
    durationMinutes: config.durationMinutes ?? outline.tasks.reduce((n, t) => n + t.timeMinutes, 0),
    taskCount: outline.tasks.length,
    aiPolicy: config.aiPolicy,
    skills: config.targetSkills.map((s) => ({
      skillSlug: s.skillSlug,
      name: skillRowBySlug.get(s.skillSlug)?.name ?? s.skillSlug,
      weight: s.weight,
      subskills: s.subskills.map(
        (slug) => skillRowBySlug.get(s.skillSlug)?.subskills.find((sub) => sub.slug === slug)?.name ?? slug,
      ),
    })),
    tasks: outline.tasks.map((t) => ({
      skillSlug: t.skillSlug,
      type: t.type,
      title: t.title,
      prompt: t.prompt,
      marks: t.marks,
      timeMinutes: t.timeMinutes,
    })),
  };

  const outcome = await requestWording(promptInput, provider, { signal: deps.signal });
  if (!outcome.ok) {
    return {
      assembled: outline,
      generationMethod: "TEMPLATE",
      generationModel: null,
      aiFallback: withTemplateSuffix(outcome.fallback),
    };
  }

  const assembled = await assembleAssessment({ ...config, seed, aiWording: outcome.wording }, deps.prisma);

  return {
    assembled,
    generationMethod: "AI",
    generationModel: provider.model,
    aiFallback: null,
  };
}

function withTemplateSuffix(fallback: AiFallback): AiFallback {
  return { code: fallback.code, message: `${fallback.message} This draft was generated from templates instead.` };
}

export type { AiFallback, AiProvider } from "./types.js";
export { DEFAULT_GEMINI_MODEL } from "./gemini.js";
export { buildWordingPrompt, WORDING_CONTRACT, WORDING_SYSTEM_PROMPT } from "./prompt.js";
