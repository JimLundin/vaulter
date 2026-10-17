import { z } from 'zod';
import { agentSettingsSchema } from '@/agent/schema.ts';
import { type JsonValue, type ReadView, sameEntity, type Transaction } from '@/vault/eav/index.ts';
import type {
  AgentRef,
  AgentRunRef,
  agentSchema,
  ModelStepRef,
  RunToolRef,
  ToolExecutionRef,
} from './schema.ts';

type Writing = Transaction<typeof agentSchema>;
type Reading = ReadView<typeof agentSchema>;
const count = z.number().int().nonnegative();
const error = z.strictObject({ code: z.string().min(1), message: z.string() });
const inputSchema = z.strictObject({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  transformation: z.enum(['verbatim', 'selection', 'summary', 'truncation', 'generated']),
  content: z.json(),
});
export type RunInput = Omit<z.input<typeof inputSchema>, 'content'> & {
  readonly content: JsonValue;
};

/** Compose this in the caller's transaction. Successful return does not execute a provider. */
export async function startAgentRun(
  tx: Writing,
  options: {
    readonly agent: AgentRef;
    readonly startedAt: Date;
    /** Effective transport instructions, retained independently of editable configuration. */
    readonly instructions?: string;
    /** Effective inputs after context selection; configuration instructions are prepended. */
    readonly inputs: readonly RunInput[];
  },
) {
  const startedAt = z.date().parse(options.startedAt);
  const inputs = z.array(inputSchema).parse(options.inputs);
  const agent = await tx.entities.agents.get(options.agent, {
    select: {
      actor: { kind: true },
      provider: true,
      model: true,
      instructions: true,
      settings: true,
      tools: { name: true, version: true },
    },
  });
  if (!agent || agent.actor.kind !== 'agent') throw new Error('An Agent requires an agent actor');
  z.string().min(1).parse(agent.provider);
  z.string().min(1).parse(agent.model);
  agentSettingsSchema.parse(agent.settings);
  const names = new Set<string>();
  for (const tool of agent.tools) {
    z.string().min(1).parse(tool.name);
    z.string().min(1).parse(tool.version);
    if (names.has(tool.name)) throw new Error('Enabled tool names must be unique');
    names.add(tool.name);
  }
  const instructions =
    options.instructions === undefined
      ? agent.instructions
      : z.string().parse(options.instructions);
  const run = await tx.entities.agentRuns.insert({
    agent,
    author: agent.actor,
    startedAt,
    status: 'running',
    provider: agent.provider,
    requestedModel: agent.model,
    instructions,
    settings: agent.settings,
  });
  const tools = [];
  for (const tool of agent.tools)
    tools.push(await tx.entities.runTools.insert({ run, name: tool.name, version: tool.version }));
  const effective: RunInput[] = instructions
    ? [{ role: 'system', transformation: 'generated', content: instructions }, ...inputs]
    : inputs;
  const recordedInputs = [];
  for (const [position, input] of effective.entries())
    recordedInputs.push(await tx.entities.contextInputs.insert({ run, position, ...input }));
  return { run, tools, inputs: recordedInputs };
}

const outcomeSchema = z
  .strictObject({
    status: z.enum(['complete', 'failed', 'stopped', 'interrupted']),
    endedAt: z.date(),
    servedModel: z.string().min(1).optional(),
    request: z.string().min(1).optional(),
    finishReason: z.string().optional(),
    firstOutputMs: z.number().nonnegative().optional(),
    inputTokens: count.optional(),
    outputTokens: count.optional(),
    cachedInputTokens: count.optional(),
    reasoningTokens: count.optional(),
    usage: z.json().optional(),
    cost: z
      .strictObject({
        amount: z.number().nonnegative(),
        currency: z.string().min(1),
        estimated: z.boolean(),
        pricing: z.strictObject({
          source: z.string().min(1),
          at: z.iso.datetime({ offset: true }),
          rates: z.record(z.string(), z.json()),
        }),
      })
      .optional(),
    output: z.json().optional(),
    error: error.optional(),
  })
  .refine(
    (value) => value.status !== 'failed' || value.error !== undefined,
    'Failed runs require an error',
  );
export type RunOutcome = z.input<typeof outcomeSchema>;

/** Domain transitions are guarded here; generic EAV writes only validate schema structure. */
export async function finishAgentRun(tx: Writing, identity: AgentRunRef, outcome: RunOutcome) {
  const parsed = outcomeSchema.parse(outcome);
  const run = await tx.entities.agentRuns.get(identity, {
    select: { status: true, startedAt: true },
  });
  if (!run || run.status !== 'running') throw new Error('Only a running Agent run can finish');
  const elapsedMs = parsed.endedAt.getTime() - run.startedAt.getTime();
  if (elapsedMs < 0 || (parsed.firstOutputMs ?? 0) > elapsedMs)
    throw new Error('Invalid run timing');
  const pending = await tx.entities.toolExecutions.first({
    where: { tool: { matches: { run: { eq: run } } }, status: { eq: 'running' } },
    select: {},
  });
  if (pending) throw new Error('Record pending tool outcomes before finishing the run');
  if (
    await tx.entities.modelSteps.first({
      where: { run: { eq: run }, status: { eq: 'running' } },
      select: {},
    })
  )
    throw new Error('Record pending model outcomes before finishing the run');
  // Optional omitted fields stay absent; undefined is not an EAV value.
  const { status: _status, startedAt: _startedAt, ...reference } = run;
  await tx.entities.agentRuns.update({ ...reference, ...defined(parsed), elapsedMs });
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, part]) => part !== undefined)) as T;
}

const invocationSchema = z.strictObject({
  call: z.string().min(1),
  attempt: count.min(1).default(1),
  startedAt: z.date(),
  input: z.json(),
});
export type ToolInvocation = Omit<z.input<typeof invocationSchema>, 'input'> & {
  readonly input: JsonValue;
  readonly step?: ModelStepRef;
};
export async function startToolExecution(
  tx: Writing,
  identity: RunToolRef,
  invocation: ToolInvocation,
) {
  const { step, ...supplied } = invocation;
  const value = invocationSchema.parse(supplied);
  const tool = await tx.entities.runTools.get(identity, {
    select: { run: { status: true, startedAt: true } },
  });
  if (!tool || tool.run.status !== 'running')
    throw new Error('Tool execution requires a running run');
  if (value.startedAt < tool.run.startedAt) throw new Error('Tool starts before its run');
  if (step) {
    const accepted = await tx.entities.modelSteps.get(step, {
      select: { run: true, status: true },
    });
    if (!(accepted && sameEntity(accepted.run, tool.run)))
      throw new Error('Tool step belongs to another run');
  }
  const executions = await tx.entities.toolExecutions.query({
    limit: null, // Canonical run reading and tool admission require the complete ordered activity.
    where: { tool: { matches: { run: { eq: tool.run } } } },
    select: { position: true, call: true, attempt: true, status: true, tool: true },
    orderBy: [{ position: 'desc' }],
  });
  if (executions.some((item) => item.status === 'running'))
    throw new Error('A tool invocation is still pending');
  const previous = executions.find((item) => item.call === value.call);
  if (
    previous
      ? !sameEntity(previous.tool, tool) ||
        previous.status !== 'failed' ||
        value.attempt !== previous.attempt + 1
      : value.attempt !== 1
  )
    throw new Error('Invalid tool call attempt');
  return tx.entities.toolExecutions.insert({
    tool,
    ...(step && { step }),
    position: (executions[0]?.position ?? -1) + 1,
    ...value,
    status: 'running',
  });
}

const toolOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('complete'), endedAt: z.date(), output: z.json() }),
  z.strictObject({ status: z.literal('failed'), endedAt: z.date(), error }),
  z.strictObject({ status: z.literal('cancelled'), endedAt: z.date(), error: error.optional() }),
]);
export type ToolOutcome =
  | { readonly status: 'complete'; readonly endedAt: Date; readonly output: JsonValue }
  | Exclude<z.input<typeof toolOutcomeSchema>, { status: 'complete' }>;
export async function finishToolExecution(
  tx: Writing,
  identity: ToolExecutionRef,
  outcome: ToolOutcome,
) {
  const parsed = toolOutcomeSchema.parse(outcome);
  const execution = await tx.entities.toolExecutions.get(identity, {
    select: { startedAt: true, status: true, tool: { run: { status: true } } },
  });
  if (!execution || execution.status !== 'running' || execution.tool.run.status !== 'running')
    throw new Error('Only a running tool in a running run can finish');
  const elapsedMs = parsed.endedAt.getTime() - execution.startedAt.getTime();
  if (elapsedMs < 0) throw new Error('Tool ends before it starts');
  const { startedAt: _startedAt, status: _status, tool: _tool, ...reference } = execution;
  await tx.entities.toolExecutions.update({ ...reference, ...defined(parsed), elapsedMs });
}

/** Pass a transaction or db.at(commit) to keep this multi-query read on one snapshot. */
export async function readAgentRun(view: Reading, identity: AgentRunRef) {
  const run = await view.entities.agentRuns.get(identity, {
    select: {
      agent: true,
      author: { name: true },
      status: true,
      startedAt: true,
      endedAt: true,
      provider: true,
      requestedModel: true,
      servedModel: true,
      instructions: true,
      settings: true,
      output: true,
      error: true,
      request: true,
      finishReason: true,
      elapsedMs: true,
      firstOutputMs: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      reasoningTokens: true,
      usage: true,
      cost: true,
    },
  });
  if (!run) return;
  const inputs = await view.entities.contextInputs.query({
    limit: null, // Canonical run reading and tool admission require the complete ordered activity.
    where: { run: { eq: run } },
    select: { position: true, role: true, transformation: true, content: true },
    orderBy: [{ position: 'asc' }],
  });
  const tools = await view.entities.runTools.query({
    limit: null, // Canonical run reading and tool admission require the complete ordered activity.
    where: { run: { eq: run } },
    select: { name: true, version: true },
    orderBy: [{ name: 'asc' }],
  });
  const executions = await view.entities.toolExecutions.query({
    limit: null, // Canonical run reading and tool admission require the complete ordered activity.
    where: { tool: { matches: { run: { eq: run } } } },
    select: {
      tool: { name: true, version: true },
      position: true,
      call: true,
      attempt: true,
      status: true,
      startedAt: true,
      endedAt: true,
      elapsedMs: true,
      input: true,
      output: true,
      error: true,
    },
    orderBy: [{ position: 'asc' }],
  });
  const steps = await view.entities.modelSteps.query({
    limit: null, // Canonical run reading and tool admission require the complete ordered activity.
    where: { run: { eq: run } },
    select: {
      position: true,
      status: true,
      inputFormat: true,
      input: true,
      configuration: true,
      response: true,
      error: true,
    },
    orderBy: [{ position: 'asc' }],
  });
  return { ...run, inputs, tools, executions, steps };
}
