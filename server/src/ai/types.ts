/**
 * Shared types for the AI provider layer.
 * Provider-agnostic: Gemini is one adapter behind this interface.
 */

export const AI_ERROR_CODES = [
  "NOT_CONFIGURED", // no key / unknown provider name
  "AUTH", // key rejected
  "QUOTA", // free quota exhausted
  "MODEL_UNAVAILABLE", // configured model not available to this key
  "BLOCKED", // provider refused the prompt
  "TIMEOUT", // no response in time
  "NETWORK", // transport / 5xx failure
  "BAD_RESPONSE", // unreadable or empty response
  "INVALID_OUTPUT", // readable, but failed schema validation
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/**
 * A provider failure with a recruiter-safe message.
 * `retryable` is true when trying the same request once more can plausibly succeed.
 */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isAiProviderError(err: unknown): err is AiProviderError {
  return err instanceof AiProviderError;
}

/** Why a draft fell back to template generation. Never shown as an AI success. */
export type AiFallback = {
  code: AiErrorCode;
  message: string;
};

export type AiProviderName = "gemini";

export type AiJsonRequest = {
  system: string;
  user: string;
};

export interface AiProvider {
  readonly name: AiProviderName;
  readonly model: string;
  /** Returns the raw JSON text produced by the model. Throws AiProviderError. */
  generateJson(input: AiJsonRequest, signal?: AbortSignal): Promise<string>;
}
