import { z } from 'zod';
import { canonical, frozen, type JsonObject } from '@/application/store/index.ts';

/** Invocation settings are narrower than historical JSON, whose unknown fields remain readable. */
export const agentSettingsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  topP: z.number().finite().min(0).max(1).optional(),
  topK: z.number().int().nonnegative().optional(),
  presencePenalty: z.number().finite().min(-2).max(2).optional(),
  frequencyPenalty: z.number().finite().min(-2).max(2).optional(),
  stopSequences: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
});
export function parseAgentSettings(value: unknown): JsonObject {
  canonical(value);
  agentSettingsSchema.parse(value);
  return frozen(structuredClone(value)) as JsonObject;
}
