/**
 * Google Gemini Developer API adapter (free tier).
 * Uses the REST API through global fetch — no SDK, no extra dependency.
 * The API key is only ever sent in the x-goog-api-key header, never in a URL.
 */

import { AiProviderError, type AiJsonRequest, type AiProvider } from "./types.js";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Free-tier Flash model; override with GEMINI_MODEL.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 4096;

export type GeminiProviderOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

function normaliseModel(model: string): string {
  return model.replace(/^models\//i, "").trim();
}

function statusToError(status: number): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError("AUTH", "Gemini rejected the API key. Check GEMINI_API_KEY on the server.", false);
  }
  if (status === 404) {
    return new AiProviderError(
      "MODEL_UNAVAILABLE",
      `The configured Gemini model is not available for this key. Set GEMINI_MODEL to a free-tier model such as ${DEFAULT_GEMINI_MODEL}.`,
      false,
    );
  }
  if (status === 429) {
    return new AiProviderError("QUOTA", "Gemini's free quota is used up right now.", true);
  }
  if (status === 408) {
    return new AiProviderError("TIMEOUT", "Gemini did not respond in time.", true);
  }
  if (status >= 500) {
    return new AiProviderError("NETWORK", "Gemini is temporarily unavailable.", true);
  }
  return new AiProviderError("BAD_RESPONSE", `Gemini rejected the request (HTTP ${status}).`, false);
}

/**
 * Creates a Gemini provider. Throws AiProviderError("NOT_CONFIGURED") when the key is empty.
 */
export function createGeminiProvider(options: GeminiProviderOptions): AiProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new AiProviderError("NOT_CONFIGURED", "AI_PROVIDER is set to gemini but GEMINI_API_KEY is empty on the server.");
  }

  const model = normaliseModel(options.model?.trim() || DEFAULT_GEMINI_MODEL);
  const baseUrl = (options.baseUrl ?? GEMINI_API_BASE).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: "gemini",
    model,

    async generateJson(input: AiJsonRequest, signal?: AbortSignal): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onExternalAbort = () => controller.abort();
      signal?.addEventListener("abort", onExternalAbort);

      try {
        const response = await doFetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: "user", parts: [{ text: input.user }] }],
            generationConfig: {
              // JSON mode only: responseSchema is deprecated, so output is validated with Zod instead.
              // No temperature/top_p/top_k: Gemini 3.8 generation configs must omit sampling controls.
              responseMimeType: "application/json",
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw statusToError(response.status);

        let data: GeminiResponse;
        try {
          data = (await response.json()) as GeminiResponse;
        } catch {
          throw new AiProviderError("BAD_RESPONSE", "Gemini returned a response we could not read.", true);
        }

        const blockReason = data.promptFeedback?.blockReason;
        if (blockReason) {
          throw new AiProviderError(
            "BLOCKED",
            `Gemini declined this request (${blockReason}). Adjust the requirements wording.`,
            false,
          );
        }

        const text = (data.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();

        if (!text) {
          throw new AiProviderError("BAD_RESPONSE", "Gemini returned an empty response.", true);
        }
        return text;
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        const aborted = err instanceof Error && err.name === "AbortError";
        throw aborted
          ? new AiProviderError("TIMEOUT", "Gemini did not respond in time.", true)
          : new AiProviderError("NETWORK", "Could not reach Gemini.", true);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}
