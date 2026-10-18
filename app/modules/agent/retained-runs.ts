import { z } from 'zod';
import {
  clear,
  type EntityRef,
  type RetainedStateReference,
  type Transaction,
} from '@/core/store/index.ts';
import type { Actor } from '@/modules/actors/index.ts';
import type { AgentRunRef, agentSchema } from './records.ts';
import { recordRunTool, type RunInput } from './operations.ts';
import type { RecordedToolVersion } from './tool-version.ts';

const count = z.number().int().nonnegative();
const valueSchema = z
  .strictObject({
    startedAt: z.date(),
    status: z.enum(['running', 'complete', 'failed', 'stopped', 'interrupted']),
    provider: z.string().min(1),
    requestedModel: z.string().min(1),
    instructions: z.string(),
    settings: z.json(),
    endedAt: z.date().optional(),
    servedModel: z.string().optional(),
    request: z.string().optional(),
    finishReason: z.string().optional(),
    elapsedMs: z.number().nonnegative().optional(),
    firstOutputMs: z.number().nonnegative().optional(),
    inputTokens: count.optional(),
    outputTokens: count.optional(),
    cachedInputTokens: count.optional(),
    reasoningTokens: count.optional(),
    usage: z.json().optional(),
    cost: z.json().optional(),
    output: z.json().optional(),
    error: z.json().optional(),
  })
  .refine(
    (value) => !value.endedAt || value.endedAt >= value.startedAt,
    'Invalid recorded run timing',
  );

export type RetainedAgentRunValue = z.input<typeof valueSchema>;
export interface RetainedAgentRunInput {
  readonly agentActor: EntityRef<typeof Actor>;
  readonly author: EntityRef<typeof Actor>;
  readonly provenance: RetainedStateReference;
  readonly value: RetainedAgentRunValue;
  /** Already supplied inputs, in their original order. Instructions are not prepended. */
  readonly inputs: readonly (RunInput & { readonly position: number })[];
  readonly tools: readonly ({ readonly name: string } & RecordedToolVersion)[];
}
type Writing = Transaction<typeof agentSchema>;

/** Admit original observed activity without inventing editable configuration or executing it. */
export async function recordAgentRun(tx: Writing, input: RetainedAgentRunInput) {
  const value = valueSchema.parse(input.value);
  const actor = await tx.entities.actors.get(input.agentActor, { select: { kind: true } });
  if (actor?.kind !== 'agent') throw new Error('A retained run requires an agent actor');
  const positions = new Set<number>();
  const inputs = input.inputs.map((part) => {
    const parsed = z
      .strictObject({
        position: count,
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        transformation: z.enum(['verbatim', 'selection', 'summary', 'truncation', 'generated']),
        content: z.json(),
      })
      .parse(part);
    if (positions.has(parsed.position)) throw new Error('Run input positions must be unique');
    positions.add(parsed.position);
    return parsed;
  });
  const names = new Set<string>();
  for (const tool of input.tools) {
    if (names.has(tool.name)) throw new Error('Enabled tool names must be unique');
    names.add(tool.name);
  }
  const run = await tx.entities.agentRuns.insert({
    ...defined(value),
    agentActor: input.agentActor,
    author: input.author,
    provenance: input.provenance,
  });
  const tools = [];
  for (const tool of input.tools) tools.push(await recordRunTool(tx, run, tool));
  const recordedInputs = [];
  for (const part of inputs)
    recordedInputs.push(await tx.entities.contextInputs.insert({ run, ...part }));
  return { run, tools, inputs: recordedInputs };
}

/** Replace a retained run's observed fields; preserve identity, inputs and accepted tool declarations. */
export async function reviseRecordedAgentRun(
  tx: Writing,
  identity: AgentRunRef,
  value: RetainedAgentRunValue,
  provenance: RetainedStateReference,
) {
  const parsed = valueSchema.parse(value);
  const run = await tx.entities.agentRuns.get(identity, {
    select: { agent: true, agentActor: true, provenance: true },
  });
  if (!run || run.agent || !run.agentActor || !run.provenance)
    throw new Error('Only a retained external Agent run can be revised');
  const optional = [
    'endedAt',
    'servedModel',
    'request',
    'finishReason',
    'elapsedMs',
    'firstOutputMs',
    'inputTokens',
    'outputTokens',
    'cachedInputTokens',
    'reasoningTokens',
    'usage',
    'cost',
    'output',
    'error',
  ] as const;
  await tx.entities.agentRuns.update({
    ...identity,
    ...Object.fromEntries(optional.map((key) => [key, clear])),
    ...defined(parsed),
    provenance,
  });
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, part]) => part !== undefined)) as T;
}
