import { e, type EntityRef } from '../../../vault/eav/index.ts';
import { Actor } from '../../../vault/records/actor.ts';
import {
  AgentRun,
  ToolExecution,
  ContextInput,
  agentEntities,
} from '../../../agent/data/schema.ts';

export const Conversation = e.entity('chat.conversation', {
  title: e.string(),
  createdAt: e.datetime(),
  createdAtPrecision: e.enum('second', 'minute', 'day', 'approximate').optional(),
});

export const Exchange = e.entity('chat.exchange', {
  conversation: e.ref(Conversation),
  position: e.number(),
  startedAt: e.datetime(),
  startedAtPrecision: e.enum('second', 'minute', 'day', 'approximate').optional(),
  endedAt: e.datetime().optional(),
  timezone: e.string().optional(),
  offsetMinutes: e.number().optional(),
  summary: e.string().optional(),
  preamble: e.string().optional(),
});

export const Message = e.entity('chat.message', {
  exchange: e.ref(Exchange),
  position: e.number(),
  role: e.enum('user', 'agent', 'record'),
  at: e.datetime(),
  atPrecision: e.enum('second', 'minute', 'day', 'approximate').optional(),
  status: e.enum('running', 'complete', 'failed', 'stopped', 'interrupted'),
  author: e.ref(Actor).optional(),
  run: e.ref(AgentRun).optional(),
  label: e.string().optional(),
  input: e.json().optional(),
  error: e.json().optional(),
});

export const TextPart = e.entity('chat.textPart', {
  message: e.ref(Message),
  position: e.number(),
  text: e.string(),
});

/** One reference to the receipt; Chat does not copy tool arguments or outcomes. */
export const ToolPart = e.entity('chat.toolPart', {
  message: e.ref(Message),
  position: e.number(),
  execution: e.ref(ToolExecution),
});

/** Identity association only. ContextInput retains the actual supplied content. */
export const InputSource = e.entity('chat.inputSource', {
  input: e.ref(ContextInput),
  message: e.ref(Message),
});

/** Navigation and transport keys are isolated from domain object identity. */
export const ConversationRoute = e.entity('chat.route', {
  value: e.string(),
  conversation: e.ref(Conversation),
});
export const Submission = e.entity('chat.submission', {
  key: e.string(),
  route: e.ref(ConversationRoute),
  userMessage: e.ref(Message),
  response: e.ref(Message),
  run: e.ref(AgentRun),
});

export const chatEntities = {
  conversations: Conversation.extend({ exchanges: e.inverse(Exchange, 'conversation') }),
  exchanges: Exchange.extend({ messages: e.inverse(Message, 'exchange') }),
  messages: Message.extend({
    textParts: e.inverse(TextPart, 'message'),
    toolParts: e.inverse(ToolPart, 'message'),
  }),
  textParts: TextPart,
  toolParts: ToolPart,
  inputSources: InputSource,
  conversationRoutes: ConversationRoute,
  submissions: Submission,
} as const;

/** Register once; transactions inherit both producers' definitions. */
export const chatSchema = e.registry({ ...agentEntities, ...chatEntities });
export type ConversationRef = EntityRef<typeof Conversation>;
export type ExchangeRef = EntityRef<typeof Exchange>;
export type MessageRef = EntityRef<typeof Message>;
