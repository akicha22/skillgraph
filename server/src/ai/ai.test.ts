import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAssessmentDraft, parseWording, requestWording, resolveAiProvider } from "./index.js";
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from "./gemini.js";
import { AiProviderError, type AiProvider } from "./types.js";
import { buildWordingPrompt, WORDING_CONTRACT, type WordingPromptInput } from "./prompt.js";

// ---------- fixtures ----------

const REQUIREMENTS =
  "We need a junior operations associate who can analyse business data and negotiate basic vendor agreements. Intermediate level, about 45 minutes.";

const validWording = {
  title: "Junior Operations Associate Assessment",
  description: "A practical assessment covering sales data analysis and a vendor price negotiation.",
  jobContext: "You are joining Northline Trading in Bengaluru as a junior operations associate.",
  candidateInstructions:
    "Read every task before you start. You have 45 minutes in total. AI assistants are not allowed during this assessment. Submit every answer in the box provided.",
  tasks: [
    {
      skillSlug: "excel",
      title: "Sales performance review",
      brief:
        "Your manager needs a short review of the last six months of sales before the Monday operations meeting.",
    },
    {
      skillSlug: "negotiation",
      brief: "A long-standing supplier has proposed a price increase five days before the contract renews.",
    },
  ],
};

const promptInput: WordingPromptInput = {
  requirementsText: REQUIREMENTS,
  jobTitle: "Junior Operations Associate",
  companyName: "Northline Trading",
  targetLevel: "JUNIOR",
  difficulty: "INTERMEDIATE",
  durationMinutes: 45,
  taskCount: 2,
  aiPolicy: "NOT_ALLOWED",
  skills: [
    { skillSlug: "excel", name: "Excel", weight: 50, subskills: ["Data Analysis"] },
    { skillSlug: "negotiation", name: "Negotiation", weight: 50, subskills: [] },
  ],
  tasks: [
    {
      skillSlug: "excel",
      type: "DATA_ANALYTICAL",
      title: "Sales Analysis — Retail",
      prompt: "You are a business analyst at Northline Trading. Answer the questions using the table.",
      marks: 50,
      timeMinutes: 22,
    },
    {
      skillSlug: "negotiation",
      type: "STRUCTURED_RESPONSE",
      title: "Negotiate a supplier price increase",
      prompt: "You are a procurement lead at Northline Trading.",
      marks: 50,
      timeMinutes: 23,
    },
  ],
};

const allowed = new Set(["excel", "negotiation"]);

// ---------- fake providers ----------

type FakeProvider = AiProvider & { calls: number };

function replyingProvider(replies: (string | Error)[]): FakeProvider {
  const provider: FakeProvider = {
    name: "gemini",
    model: "test-model",
    calls: 0,
    async generateJson() {
      const reply = replies[Math.min(provider.calls, replies.length - 1)];
      provider.calls += 1;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return provider;
}

function fetchStub(status: number, body: unknown, seen?: { url?: string; init?: RequestInit }) {
  return (async (url: string, init: RequestInit) => {
    if (seen) {
      seen.url = String(url);
      seen.init = init;
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function rawFetchStub(body: string): typeof fetch {
  return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

async function expectProviderError(fetchImpl: typeof fetch, code: string) {
  const provider = createGeminiProvider({ apiKey: "test-key", fetchImpl });
  await assert.rejects(
    () => provider.generateJson({ system: "system", user: "user" }),
    (err: unknown) => {
      assert.ok(err instanceof AiProviderError);
      assert.equal(err.code, code);
      return true;
    },
  );
}

// ---------- provider resolution ----------

describe("AI provider resolution", () => {
  it("defaults to template mode with no key and no fallback", () => {
    assert.deepEqual(resolveAiProvider({}), { provider: null, fallback: null });
    assert.deepEqual(resolveAiProvider({ provider: "TEMPLATE" }), { provider: null, fallback: null });
    assert.deepEqual(resolveAiProvider({ provider: " template " }), { provider: null, fallback: null });
  });

  it("reports a missing key instead of pretending AI is configured", () => {
    const resolution = resolveAiProvider({ provider: "gemini", apiKey: "   " });
    assert.equal(resolution.provider, null);
    assert.equal(resolution.fallback?.code, "NOT_CONFIGURED");
  });

  it("builds a Gemini provider when a key is present, using the default model", () => {
    const resolution = resolveAiProvider({ provider: "gemini", apiKey: "test-key", model: "" });
    assert.equal(resolution.fallback, null);
    assert.equal(resolution.provider?.name, "gemini");
    assert.equal(resolution.provider?.model, DEFAULT_GEMINI_MODEL);
  });

  it("rejects unknown provider names", () => {
    const resolution = resolveAiProvider({ provider: "openai-ish" });
    assert.equal(resolution.provider, null);
    assert.equal(resolution.fallback?.code, "NOT_CONFIGURED");
    assert.match(resolution.fallback?.message ?? "", /Unknown AI_PROVIDER/);
  });
});

// ---------- output validation ----------

describe("AI wording validation", () => {
  it("accepts a valid plan", () => {
    const result = parseWording(JSON.stringify(validWording), allowed);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.wording.title, validWording.title);
    assert.equal(result.wording.tasks.length, 2);
  });

  it("accepts JSON wrapped in a markdown fence", () => {
    const result = parseWording("```json\n" + JSON.stringify(validWording) + "\n```", allowed);
    assert.equal(result.ok, true);
  });

  it("rejects non-JSON output", () => {
    const result = parseWording("Here is your assessment!", allowed);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /not valid JSON/);
  });

  it("rejects skill slugs the recruiter did not approve", () => {
    const plan = {
      ...validWording,
      tasks: [{ skillSlug: "python", brief: "Write a script that cleans the sales export before the standup." }],
    };
    const result = parseWording(JSON.stringify(plan), allowed);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /unknown skill slug/);
  });

  it("rejects a plan that breaks the contract lengths", () => {
    const result = parseWording(JSON.stringify({ ...validWording, description: "too short" }), allowed);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /description/);
  });

  it("rejects extra keys that are not part of the contract", () => {
    const result = parseWording(JSON.stringify({ ...validWording, answerKey: { total_revenue: 1 } }), allowed);
    assert.equal(result.ok, false);
  });
});

// ---------- prompt ----------

describe("AI wording prompt", () => {
  it("carries the recruiter requirements, skill slugs and the JSON contract", () => {
    const { system, user } = buildWordingPrompt(promptInput);
    assert.ok(system.includes(WORDING_CONTRACT));
    assert.match(system, /wording only/i);
    assert.ok(user.includes(REQUIREMENTS));
    assert.ok(user.includes("Northline Trading"));
    assert.ok(user.includes("slug: excel"));
    assert.ok(user.includes("AI assistants are not allowed"));
    assert.ok(user.includes("Negotiation"));
  });
});

// ---------- retry and fallback behaviour ----------

describe("requestWording", () => {
  it("returns validated wording on the first attempt", async () => {
    const provider = replyingProvider([JSON.stringify(validWording)]);
    const outcome = await requestWording(promptInput, provider);
    assert.equal(outcome.ok, true);
    assert.equal(provider.calls, 1);
  });

  it("asks again once when the first reply is invalid", async () => {
    const provider = replyingProvider(["not json", JSON.stringify(validWording)]);
    const outcome = await requestWording(promptInput, provider);
    assert.equal(outcome.ok, true);
    assert.equal(provider.calls, 2);
  });

  it("falls back with INVALID_OUTPUT after two invalid replies", async () => {
    const provider = replyingProvider(["not json", "still not json"]);
    const outcome = await requestWording(promptInput, provider);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.fallback.code, "INVALID_OUTPUT");
    assert.equal(provider.calls, 2);
  });

  it("retries once on quota errors, then falls back with QUOTA", async () => {
    const provider = replyingProvider([
      new AiProviderError("QUOTA", "Gemini's free quota is used up right now.", true),
      new AiProviderError("QUOTA", "Gemini's free quota is used up right now.", true),
    ]);
    const outcome = await requestWording(promptInput, provider);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.fallback.code, "QUOTA");
    assert.equal(provider.calls, 2);
  });

  it("does not retry an authentication failure", async () => {
    const provider = replyingProvider([new AiProviderError("AUTH", "Gemini rejected the API key.", false)]);
    const outcome = await requestWording(promptInput, provider);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.fallback.code, "AUTH");
    assert.equal(provider.calls, 1);
  });
});

// ---------- Gemini adapter ----------

describe("Gemini adapter", () => {
  it("posts to generateContent with the key in a header only", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const provider = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-test",
      fetchImpl: fetchStub(200, { candidates: [{ content: { parts: [{ text: '{"title":"x"}' }] } }] }, seen),
    });

    const text = await provider.generateJson({ system: "system", user: "user" });
    assert.equal(text, '{"title":"x"}');
    assert.ok(seen.url?.includes("/models/gemini-test:generateContent"));
    assert.ok(!seen.url?.includes("test-key"));
    assert.equal((seen.init?.headers as Record<string, string>)["x-goog-api-key"], "test-key");

    const body = JSON.parse(String(seen.init?.body)) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: { responseMimeType: string };
    };
    assert.equal(body.systemInstruction.parts[0].text, "system");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    // Gemini 3.8 rejects sampling controls in the generation config.
    assert.equal("temperature" in body.generationConfig, false);
    assert.equal("topP" in body.generationConfig, false);
    assert.equal("topK" in body.generationConfig, false);
  });

  it("strips a models/ prefix from the configured model", () => {
    const provider = createGeminiProvider({ apiKey: "test-key", model: "models/gemini-test" });
    assert.equal(provider.model, "gemini-test");
  });

  it("maps HTTP failures to recruiter-safe error codes", async () => {
    await expectProviderError(fetchStub(401, { error: { code: 401 } }), "AUTH");
    await expectProviderError(fetchStub(403, { error: { code: 403 } }), "AUTH");
    await expectProviderError(fetchStub(404, { error: { code: 404 } }), "MODEL_UNAVAILABLE");
    await expectProviderError(fetchStub(429, { error: { code: 429 } }), "QUOTA");
    await expectProviderError(fetchStub(500, { error: { code: 500 } }), "NETWORK");
    await expectProviderError(fetchStub(400, { error: { code: 400 } }), "BAD_RESPONSE");
  });

  it("reports blocked prompts and empty candidates", async () => {
    await expectProviderError(
      fetchStub(200, { promptFeedback: { blockReason: "SAFETY" } }),
      "BLOCKED",
    );
    await expectProviderError(fetchStub(200, { candidates: [{ content: { parts: [] } }] }), "BAD_RESPONSE");
  });

  it("reports an unreadable body as BAD_RESPONSE", async () => {
    await expectProviderError(rawFetchStub("<html>gateway</html>"), "BAD_RESPONSE");
  });

  it("never leaks the API key in an error message", async () => {
    try {
      await createGeminiProvider({ apiKey: "super-secret-key", fetchImpl: fetchStub(401, {}) }).generateJson({
        system: "s",
        user: "u",
      });
      assert.fail("expected the adapter to throw");
    } catch (err) {
      assert.ok(err instanceof AiProviderError);
      assert.ok(!err.message.includes("super-secret-key"));
    }
  });

  it("refuses to build without a key", () => {
    assert.throws(
      () => createGeminiProvider({ apiKey: " " }),
      (err: unknown) => err instanceof AiProviderError && err.code === "NOT_CONFIGURED",
    );
  });
});

// ---------- end-to-end draft generation (no network, no database) ----------

describe("generateAssessmentDraft", () => {
  const library = [
    {
      slug: "excel",
      name: "Excel",
      assessmentTypes: "DATA_ANALYTICAL",
      subskills: [{ slug: "data-analysis", name: "Data Analysis" }],
    },
    {
      slug: "negotiation",
      name: "Negotiation",
      assessmentTypes: "STRUCTURED_RESPONSE",
      subskills: [{ slug: "deal-closing", name: "Deal Closing" }],
    },
  ];

  function mockPrisma() {
    return {
      skill: {
        findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
          library.filter((s) => where.slug.in.includes(s.slug)),
      },
    };
  }

  const draftConfig = {
    requirementsText: REQUIREMENTS,
    jobTitle: "Junior Operations Associate",
    companyName: "Northline Trading",
    targetLevel: "JUNIOR" as const,
    difficulty: "INTERMEDIATE" as const,
    durationMinutes: 45,
    taskCount: 2,
    aiPolicy: "NOT_ALLOWED" as const,
    targetSkills: [
      { skillSlug: "excel", weight: 50, subskills: ["data-analysis"], source: "REQUESTED" as const },
      { skillSlug: "negotiation", weight: 50, subskills: ["deal-closing"], source: "REQUESTED" as const },
    ],
  };

  const now = () => 20260101;

  it("labels template drafts as templates", async () => {
    const draft = await generateAssessmentDraft(draftConfig, { prisma: mockPrisma(), provider: null, now });
    assert.equal(draft.generationMethod, "TEMPLATE");
    assert.equal(draft.generationModel, null);
    assert.equal(draft.aiFallback, null);
    assert.equal(draft.assembled.tasks.reduce((n, t) => n + t.marks, 0), 100);
  });

  it("applies AI wording without touching facts, marks or rubrics", async () => {
    const templateDraft = await generateAssessmentDraft(draftConfig, { prisma: mockPrisma(), provider: null, now });
    const provider = replyingProvider([JSON.stringify(validWording)]);
    const draft = await generateAssessmentDraft(draftConfig, { prisma: mockPrisma(), provider, now });

    assert.equal(draft.generationMethod, "AI");
    assert.equal(draft.generationModel, "test-model");
    assert.equal(draft.aiFallback, null);
    assert.equal(draft.assembled.title, validWording.title);
    assert.equal(draft.assembled.description, validWording.description);
    assert.equal(draft.assembled.jobContext, validWording.jobContext);
    assert.equal(draft.assembled.candidateInstructions, validWording.candidateInstructions);

    const templateExcel = templateDraft.assembled.tasks.find((t) => t.skillSlug === "excel");
    const excel = draft.assembled.tasks.find((t) => t.skillSlug === "excel");
    assert.ok(templateExcel && excel);

    // Same seed => identical dataset and facts; the brief is only prepended.
    assert.deepEqual(excel.publicData, templateExcel.publicData);
    assert.deepEqual(excel.privateData, templateExcel.privateData);
    assert.equal(excel.title, "Sales performance review");
    assert.equal(excel.prompt, `${validWording.tasks[0].brief}\n\n${templateExcel.prompt}`);
    assert.equal(excel.marks, templateExcel.marks);
    assert.equal(
      excel.rubric.reduce((n, c) => n + c.maxMarks, 0),
      excel.marks,
    );

    const negotiation = draft.assembled.tasks.find((t) => t.skillSlug === "negotiation");
    assert.ok(negotiation);
    // No title override was supplied, so the coded title survives.
    assert.equal(negotiation.title, "Negotiate a supplier price increase");
    assert.ok(negotiation.prompt.startsWith(validWording.tasks[1].brief));
    assert.ok(negotiation.privateData);
  });

  it("falls back to template wording when the provider quota is exhausted", async () => {
    const provider = replyingProvider([
      new AiProviderError("QUOTA", "Gemini's free quota is used up right now.", true),
      new AiProviderError("QUOTA", "Gemini's free quota is used up right now.", true),
    ]);
    const draft = await generateAssessmentDraft(draftConfig, { prisma: mockPrisma(), provider, now });

    assert.equal(draft.generationMethod, "TEMPLATE");
    assert.equal(draft.generationModel, null);
    assert.equal(draft.aiFallback?.code, "QUOTA");
    assert.match(draft.aiFallback?.message ?? "", /templates instead/);
    assert.equal(draft.assembled.tasks.reduce((n, t) => n + t.marks, 0), 100);
  });

  it("falls back when the provider keeps returning invalid output", async () => {
    const provider = replyingProvider(["{}", "nope"]);
    const draft = await generateAssessmentDraft(draftConfig, { prisma: mockPrisma(), provider, now });
    assert.equal(draft.generationMethod, "TEMPLATE");
    assert.equal(draft.aiFallback?.code, "INVALID_OUTPUT");
    assert.equal(draft.assembled.tasks.length >= 2, true);
  });

  it("reports a missing key as a fallback rather than an AI success", async () => {
    const draft = await generateAssessmentDraft(draftConfig, {
      prisma: mockPrisma(),
      ai: { provider: "gemini", apiKey: "" },
      now,
    });
    assert.equal(draft.generationMethod, "TEMPLATE");
    assert.equal(draft.aiFallback?.code, "NOT_CONFIGURED");
  });
});
