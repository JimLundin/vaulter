import { z } from 'zod';
import type { Transaction, ReadView, EntityRef, JsonValue } from '@/application/store/index.ts';
import type { Actor } from '@/actors/index.ts';
import { startAgentRun, type RunInput } from '@/agent/index.ts';
import { readAgentActivity } from '@/agent/index.ts';
import type { AgentRef } from '@/agent/index.ts';
import type { chatSchema, ExchangeRef } from './records.ts';

type Writing = Transaction<typeof chatSchema>;
type Reading = ReadView<typeof chatSchema>;

/** Resolve the Vault's authoritative identity, creating it atomically on first use. */
export async function conversation(tx: Writing) {
  const found = await tx.entities.conversations.query({ select: { createdAt: true }, limit: 2 });
  if (found.length > 1) throw new Error('Vault has more than one native dialogue');
  return found[0] ?? tx.entities.conversations.insert({ createdAt: new Date() });
}
export async function appendExchange(tx: Writing, startedAt?: Date) {
  const dialogue = await conversation(tx);
  const last = await tx.entities.exchanges.first({
    select: { position: true },
    orderBy: [{ position: 'desc' }],
  });
  return tx.entities.exchanges.insert({
    conversation: dialogue,
    position: (last?.position ?? -1) + 1,
    ...(startedAt && { startedAt: z.date().parse(startedAt) }),
  });
}
/** Admission fixes the words, execution and effective input before any provider runs. */
export async function submitChat(
  tx: Writing,
  options: {
    readonly submission: string;
    readonly author: EntityRef<typeof Actor>;
    readonly agent: AgentRef;
    readonly text: string;
    readonly at: Date;
    readonly context?: readonly RunInput[];
    readonly input?: JsonValue;
  },
) {
  const submission = z.string().min(1).parse(options.submission);
  if (await tx.entities.exchanges.first({ where: { submission: { eq: submission } }, select: {} }))
    throw new Error('Submission is already accepted');
  const text = z.string().min(1).parse(options.text);
  const at = z.date().parse(options.at);
  const author = await tx.entities.actors.get(options.author, { select: { kind: true } });
  if (author?.kind !== 'user') throw new Error('Chat submission requires a user author');
  const exchange = await appendExchange(tx, at);
  const userMessage = await tx.entities.messages.insert({
    exchange,
    author,
    at,
    text,
    ...(options.input !== undefined && { input: options.input }),
  });
  const execution = await startAgentRun(tx, {
    agent: options.agent,
    startedAt: at,
    inputs: [
      ...(options.context ?? []),
      { role: 'user', transformation: 'verbatim', content: text },
    ],
  });
  await tx.entities.inputSources.insert({ input: execution.inputs.at(-1)!, message: userMessage });
  await tx.entities.exchanges.update({ ...exchange, submission, run: execution.run });
  return { exchange, userMessage, ...execution };
}
/** Use a transaction or historical view for one consistent read. */
export async function readExchange(view: Reading, identity: ExchangeRef) {
  const exchange = await view.entities.exchanges.get(identity, {
    select: { conversation: true, position: true, startedAt: true, submission: true, run: true },
  });
  if (!exchange) return;
  const messages = await view.entities.messages.query({
    limit: null, // An Exchange must retain every Message and source contribution.
    where: { exchange: { eq: exchange } },
    select: { author: { name: true }, at: true, text: true, input: true },
  });
  const sources = await view.entities.retainedSources.query({
    limit: null, // An Exchange must retain every Message and source contribution.
    where: { exchange: { eq: exchange } },
    select: {
      speaker: true,
      occurredAt: true,
      occurredAtPrecision: true,
      text: true,
      activity: true,
      label: true,
      status: true,
      provenance: true,
    },
    orderBy: [{ position: 'asc' }],
  });
  return {
    ...exchange,
    messages,
    sources,
    execution: exchange.run ? await readAgentActivity(view, exchange.run) : undefined,
  };
}
