import { e, type EntityRef } from '@/core/store/index.ts';
import { Actor } from '@/modules/actors/index.ts';
import { AgentRun, ContextInput, agentEntities } from '@/modules/agent/index.ts';

/** One native dialogue per Vault. Topics and dates never create another scope. */
export const Conversation = e.entity('chat.conversation', {
  createdAt: e.datetime(),
});
export const Exchange = e.entity('chat.exchange', {
  conversation: e.ref(Conversation),
  position: e.number(),
  startedAt: e.datetime().optional(),
  submission: e.string().optional(),
  run: e.ref(AgentRun).optional(),
});
/** Host-owned ordered placements; targets are interpreted by their owning modules. */
export const ExchangeEmbed = e.entity('chat.exchangeEmbed', {
  exchange: e.ref(Exchange),
  order: e.number(),
  mode: e.enum('live', 'pinned'),
  target: e.historicalRef(),
  available: e.boolean(),
});
/** Canonical submitted words. Agent output is owned by its execution records. */
export const Message = e.entity('chat.message', {
  exchange: e.ref(Exchange),
  author: e.ref(Actor),
  at: e.datetime(),
  text: e.string(),
  input: e.json().optional(),
});
export const InputSource = e.entity('chat.inputSource', {
  input: e.ref(ContextInput),
  message: e.ref(Message),
});
/** Retained historical contributions, with exact evidence and no invented model steps. */
export const RetainedSource = e.entity('chat.retainedSource', {
  exchange: e.ref(Exchange),
  position: e.number(),
  speaker: e.enum('user', 'agent', 'unknown'),
  occurredAt: e.string(),
  occurredAtPrecision: e.enum('second', 'minute', 'day', 'approximate').optional(),
  text: e.string().optional(),
  activity: e.json().optional(),
  label: e.string().optional(),
  status: e.enum('running', 'complete', 'failed', 'stopped', 'interrupted').optional(),
  provenance: e.json(),
});
/** An attributed summary of a fixed, recorded prefix of the dialogue. */
export const ContextCheckpoint = e.entity('chat.contextCheckpoint', {
  through: e.ref(Exchange),
  covered: e.set(e.ref(Exchange)),
  fingerprint: e.string(),
  run: e.ref(AgentRun),
  createdAt: e.datetime(),
  title: e.string(),
  summary: e.string(),
});
/** The source selection actually supplied when a Chat run was accepted. */
export const RunContext = e.entity('chat.runContext', {
  run: e.ref(AgentRun),
  checkpoint: e.ref(ContextCheckpoint).optional(),
  exchanges: e.set(e.ref(Exchange)),
});
export const chatEntities = {
  contextCheckpoints: ContextCheckpoint,
  runContexts: RunContext,
  conversations: Conversation.extend({ exchanges: e.inverse(Exchange, 'conversation') }),
  exchanges: Exchange.extend({ messages: e.inverse(Message, 'exchange') }),
  messages: Message,
  exchangeEmbeds: ExchangeEmbed,
  inputSources: InputSource,
  retainedSources: RetainedSource,
} as const;
export const chatSchema = e.registry({ ...agentEntities, ...chatEntities });
export type ConversationRef = EntityRef<typeof Conversation>;
export type ExchangeRef = EntityRef<typeof Exchange>;
export type MessageRef = EntityRef<typeof Message>;

export type CheckpointRef = EntityRef<typeof ContextCheckpoint>;
