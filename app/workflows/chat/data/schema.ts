import { e, type EntityRef } from '../../../vault/eav/index.ts';
import { Actor } from '../../../vault/records/actor.ts';
import { AgentRun, ContextInput, agentEntities } from '../../../agent/data/schema.ts';

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
  text: e.string().optional(),
  activity: e.json().optional(),
  label: e.string().optional(),
  status: e.enum('running', 'complete', 'failed', 'stopped', 'interrupted').optional(),
  provenance: e.json(),
});
/** One-time importer bookkeeping, independent of dialogue identity. */
export const Migration = e.entity('chat.migration', {
  key: e.string(),
  sourceSequence: e.number(),
});
export const chatEntities = {
  conversations: Conversation.extend({ exchanges: e.inverse(Exchange, 'conversation') }),
  exchanges: Exchange.extend({ messages: e.inverse(Message, 'exchange') }),
  messages: Message,
  inputSources: InputSource,
  retainedSources: RetainedSource,
  chatMigrations: Migration,
} as const;
export const chatSchema = e.registry({ ...agentEntities, ...chatEntities });
export type ConversationRef = EntityRef<typeof Conversation>;
export type ExchangeRef = EntityRef<typeof Exchange>;
export type MessageRef = EntityRef<typeof Message>;
