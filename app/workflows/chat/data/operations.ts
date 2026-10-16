import { z } from 'zod';
import {
  sameEntity,
  type Transaction,
  type ReadView,
  type EntityRef,
  type JsonValue,
} from '../../../vault/eav/index.ts';
import type { Actor } from '../../../vault/records/actor.ts';
import { startAgentRun, type RunInput } from '../../../agent/data/operations.ts';
import type { AgentRef, ToolExecutionRef } from '../../../agent/data/schema.ts';
import type { chatSchema, ConversationRef, ExchangeRef, MessageRef } from './schema.ts';

type Writing = Transaction<typeof chatSchema>;
type Reading = ReadView<typeof chatSchema>;

export async function createConversation(
  tx: Writing,
  value: { readonly title: string; readonly createdAt: Date },
) {
  const data = z.strictObject({ title: z.string().min(1), createdAt: z.date() }).parse(value);
  return tx.entities.conversations.insert(data);
}

async function appendExchange(tx: Writing, conversation: ConversationRef, startedAt: Date) {
  if (!(await tx.entities.conversations.get(conversation, { select: {} })))
    throw new Error('Conversation is unavailable');
  const last = await tx.entities.exchanges.first({
    where: { conversation: { eq: conversation } },
    select: { position: true },
    orderBy: [{ position: 'desc' }],
  });
  return tx.entities.exchanges.insert({
    conversation,
    position: (last?.position ?? -1) + 1,
    startedAt,
  });
}

/** One accepted submission contains its messages and the independent run's effective inputs. */
export async function submitChat(
  tx: Writing,
  options: {
    readonly conversation: ConversationRef;
    readonly author: EntityRef<typeof Actor>;
    readonly agent: AgentRef;
    readonly text: string;
    readonly at: Date;
    /** Already selected/transformed provider context; this operation appends the current user text. */
    readonly context?: readonly RunInput[];
    readonly input?: JsonValue;
  },
) {
  const text = z.string().min(1).parse(options.text);
  const at = z.date().parse(options.at);
  const input = options.input === undefined ? undefined : z.json().parse(options.input);
  const author = await tx.entities.actors.get(options.author, { select: { kind: true } });
  if (!author || author.kind !== 'user') throw new Error('Chat submission requires a user author');
  const exchange = await appendExchange(tx, options.conversation, at);
  const userMessage = await tx.entities.messages.insert({
    exchange,
    position: 0,
    role: 'user',
    at,
    status: 'complete',
    author,
    ...(input !== undefined && { input }),
  });
  await tx.entities.textParts.insert({ message: userMessage, position: 0, text });
  const execution = await startAgentRun(tx, {
    agent: options.agent,
    startedAt: at,
    inputs: [
      ...(options.context ?? []),
      { role: 'user', transformation: 'verbatim', content: text },
    ],
  });
  await tx.entities.inputSources.insert({ input: execution.inputs.at(-1)!, message: userMessage });
  const response = await tx.entities.messages.insert({
    exchange,
    position: 1,
    role: 'agent',
    at,
    status: 'running',
    author: execution.run.author,
    run: execution.run,
  });
  return { exchange, userMessage, response, ...execution };
}

export type ResponsePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool'; readonly execution: ToolExecutionRef };

/** Preserve part interleaving while keeping execution data owned by Agent. */
export async function recordResponse(
  tx: Writing,
  identity: MessageRef,
  parts: readonly ResponsePart[],
) {
  const response = await tx.entities.messages.get(identity, {
    select: { role: true, status: true, run: { status: true, endedAt: true, error: true } },
  });
  if (!response || response.role !== 'agent' || response.status !== 'running' || !response.run)
    throw new Error('Response is unavailable or already recorded');
  if (response.run.status === 'running')
    throw new Error('Record the Agent outcome before its response');
  const parsed = parts.map((part) => {
    if (part.kind === 'text') return { kind: 'text' as const, text: z.string().parse(part.text) };
    if (part.kind === 'tool') return { kind: 'tool' as const, execution: part.execution };
    throw new Error('Unknown response part');
  });
  const seen: ToolExecutionRef[] = [];
  for (const part of parsed) {
    if (part.kind !== 'tool') continue;
    const execution = await tx.entities.toolExecutions.get(part.execution, {
      select: { status: true, tool: { run: true } },
    });
    if (
      !execution ||
      execution.status === 'running' ||
      !sameEntity(execution.tool.run, response.run)
    )
      throw new Error('Response tools must be accepted outcomes from its own run');
    if (seen.some((previous) => sameEntity(previous, execution)))
      throw new Error('Duplicate response tool');
    seen.push(execution);
  }
  if (
    (await tx.entities.textParts.first({ where: { message: { eq: response } }, select: {} })) ||
    (await tx.entities.toolParts.first({ where: { message: { eq: response } }, select: {} }))
  )
    throw new Error('Response already has recorded parts');
  for (const [position, part] of parsed.entries()) {
    if (part.kind === 'text')
      await tx.entities.textParts.insert({ message: response, position, text: part.text });
    else
      await tx.entities.toolParts.insert({
        message: response,
        position,
        execution: part.execution,
      });
  }
  const { role: _role, status: _status, run, ...reference } = response;
  await tx.entities.messages.update({
    ...reference,
    status: run.status,
    ...(run.error !== undefined && { error: run.error }),
  });
}

/** Imported source text has no invented user or Agent speaker. */
export async function recordSummary(
  tx: Writing,
  options: {
    readonly conversation: ConversationRef;
    readonly at: Date;
    readonly text: string;
    readonly label?: string;
  },
) {
  const { at, text, label } = z
    .strictObject({ at: z.date(), text: z.string().min(1), label: z.string().min(1).optional() })
    .parse({ at: options.at, text: options.text, label: options.label });
  const exchange = await appendExchange(tx, options.conversation, at);
  const message = await tx.entities.messages.insert({
    exchange,
    position: 0,
    role: 'record',
    at,
    status: 'complete',
    ...(label !== undefined && { label }),
  });
  await tx.entities.textParts.insert({ message, position: 0, text });
  return { exchange, message };
}

export async function readMessage(view: Reading, identity: MessageRef) {
  const message = await view.entities.messages.get(identity, {
    select: {
      exchange: true,
      position: true,
      role: true,
      at: true,
      atPrecision: true,
      status: true,
      author: { name: true },
      run: true,
      label: true,
      input: true,
      error: true,
    },
  });
  if (!message) return;
  const text = await view.entities.textParts.query({
    where: { message: { eq: message } },
    select: { position: true, text: true },
  });
  const tools = await view.entities.toolParts.query({
    where: { message: { eq: message } },
    select: {
      position: true,
      execution: {
        tool: { name: true, version: true },
        call: true,
        status: true,
        input: true,
        output: true,
        error: true,
      },
    },
  });
  const parts = [
    ...text.map((part) => ({ ...part, kind: 'text' as const })),
    ...tools.map((part) => ({ ...part, kind: 'tool' as const })),
  ].sort((a, b) => a.position - b.position);
  return { ...message, parts };
}

/** Use db.transaction for current reads or db.at(commit) for a stable historical transcript. */
export async function readExchange(view: Reading, identity: ExchangeRef) {
  const exchange = await view.entities.exchanges.get(identity, {
    select: {
      conversation: true,
      position: true,
      startedAt: true,
      endedAt: true,
      summary: true,
      preamble: true,
    },
  });
  if (!exchange) return;
  const messages = await view.entities.messages.query({
    where: { exchange: { eq: exchange } },
    select: {},
    orderBy: [{ position: 'asc' }],
  });
  return {
    ...exchange,
    messages: await Promise.all(messages.map((message) => readMessage(view, message))),
  };
}
