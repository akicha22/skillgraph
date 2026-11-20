import { z } from "zod";

export const EVENT_TYPES = [
  "TASK_OPENED",
  "ANSWER_SAVED",
  "PASTE",
  "FOCUS_LOST",
  "FOCUS_RESTORED",
  "SUBMITTED",
] as const;

export type AttemptEventType = (typeof EVENT_TYPES)[number];

const metadataSchema = z
  .record(z.string(), z.union([z.number(), z.string().max(100)]))
  .refine((metadata) => JSON.stringify(metadata).length < 500, {
    message: "metadata must be under 500 characters",
  });

const clientEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  taskId: z.string().min(1).max(64).optional(),
  metadata: metadataSchema.optional(),
});

/** The client batches its telemetry; the server stores each entry as its own row. */
export const attemptEventBatchSchema = z.object({
  events: z.array(clientEventSchema).max(50),
});

export type AttemptEventBatch = z.infer<typeof attemptEventBatchSchema>;
export type AttemptEventMetadata = z.infer<typeof metadataSchema>;

/** Only lengths and the change in length are recorded, never any of the answer text. */
export function buildAnswerSavedMetadata(
  previousAnswer: string | null | undefined,
  newAnswer: string,
): { length: number; previousLength: number; delta: number } {
  const previousLength = previousAnswer?.length ?? 0;
  const length = newAnswer.length;
  return { length, previousLength, delta: length - previousLength };
}
