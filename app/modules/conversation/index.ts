// biome-ignore-all lint/performance/noBarrelFile: This domain exposes its behavior through one owner entry.
export { chatSchema, chatEntities } from './records.ts';
export type { ConversationRef, ExchangeRef, MessageRef } from './records.ts';
export { createConversation } from './conversation.ts';
export type { Conversation, ConversationOptions, Prompt } from './conversation.ts';
export { createEavChatBackend, eavChatFactory } from './eav-backend.ts';
export type { ChatBackendFactory, ChatOptions } from './backend.ts';
export { projectedExchange } from './projection.ts';
export { submitChat } from './submission.ts';
export { chatPreferences, chatSettings } from './preferences.ts';
export type { MessageData, MessagePart } from './message.ts';

export { appendExchangeEmbed, readExchangeEmbeds, removeExchangeEmbed } from './embeds.ts';
