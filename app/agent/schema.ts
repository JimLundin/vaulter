import { z } from 'zod';
import { canonical, frozen } from '../vault/nodes/json.ts';
import { jsonObject } from '../vault/nodes/json-schema.ts';
import type { AgentRunData, ContextInputData, ToolExecutionData } from './records.ts';
const text = z.string().min(1);
const instant = z.iso.datetime({ offset: true });
const nonnegative = z.number().finite().nonnegative();
const count = nonnegative.int();
const json = jsonObject;
const jsonValue = z.custom<import('../vault/nodes/model.ts').JsonValue>((value) => {
  try {
    canonical(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON');
const selection = z
  .strictObject({ format: z.literal('text'), start: count, end: count, unit: z.literal('utf16') })
  .refine((value) => value.end >= value.start, 'Selection ends before it starts');
const error = z.object({ code: text, message: text });
const model = z.object({ requested: text, served: text.optional() });
export const contextInputSchema = z.object({
  kind: z.literal('contextInput'),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  position: count,
  transformation: z.enum(['verbatim', 'selection', 'summary', 'truncation', 'generated']),
  content: z.union([z.string(), json]),
  selection: selection.optional(),
});
export const agentRunSchema = z.object({
  kind: z.literal('agentRun'),
  started: instant,
  ended: instant.optional(),
  status: z.enum(['running', 'complete', 'stopped', 'failed', 'interrupted']),
  provider: text,
  model,
  settings: json,
  enabledTools: z.array(z.object({ name: text, version: text.optional() })),
  request: text.optional(),
  finishReason: text.optional(),
  timing: z
    .strictObject({ elapsedMs: nonnegative, firstOutputMs: nonnegative.optional() })
    .optional(),
  usage: z
    .strictObject({
      input: count,
      output: count,
      cachedInput: count.optional(),
      reasoning: count.optional(),
      raw: json.optional(),
    })
    .optional(),
  cost: z
    .strictObject({
      amount: nonnegative,
      currency: text,
      estimated: z.boolean(),
      pricing: z.object({ source: text, at: instant, rates: json }),
    })
    .optional(),
  error: error.optional(),
  output: json.optional(),
});
export const toolExecutionSchema = z.object({
  kind: z.literal('toolExecution'),
  call: text,
  name: text,
  version: text.optional(),
  attempt: count.min(1),
  started: instant,
  ended: instant.optional(),
  elapsedMs: nonnegative.optional(),
  status: z.enum(['running', 'complete', 'failed', 'cancelled']),
  input: jsonValue,
  output: jsonValue.optional(),
  error: error.optional(),
});

function parsed<Value>(schema: z.ZodType, value: unknown): Value {
  canonical(value);
  schema.parse(value);
  return frozen(structuredClone(value)) as Value;
}
export const parseAgentRun = (value: unknown) => parsed<AgentRunData>(agentRunSchema, value);
export const parseContextInput = (value: unknown) =>
  parsed<ContextInputData>(contextInputSchema, value);
export const parseToolExecution = (value: unknown) =>
  parsed<ToolExecutionData>(toolExecutionSchema, value);

/** Invocation settings are narrower than historical JSON, whose unknown fields remain readable. */
const modelSettings = z.strictObject({
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
export function parseAgentSettings(value: unknown): import('../vault/nodes/model.ts').JsonObject {
  canonical(value);
  modelSettings.parse(value);
  return frozen(structuredClone(value)) as import('../vault/nodes/model.ts').JsonObject;
}
