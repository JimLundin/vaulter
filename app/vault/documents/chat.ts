// Application payloads stored in the common node model, independent of model SDKs and storage.
import type { JsonObject, JsonValue, NodeVersion } from '../nodes/model.ts';
import type { TransactionKind } from '../nodes/operations.ts';

declare module '../nodes/operations.ts' {
  interface TransactionActions {
    readonly chat: 'submit' | 'completeResponse' | 'stopResponse' | 'checkpointResponse';
  }
}

export const chatOperations = {
  submit: { scope: 'chat', action: 'submit' },
  completeResponse: { scope: 'chat', action: 'completeResponse' },
  stopResponse: { scope: 'chat', action: 'stopResponse' },
  checkpointResponse: { scope: 'chat', action: 'checkpointResponse' },
} as const satisfies Readonly<
  Record<'submit' | 'completeResponse' | 'stopResponse' | 'checkpointResponse', TransactionKind>
>;

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ConversationData = {
  readonly kind: 'conversation';
  readonly title: string;
  readonly createdAt: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ExchangeData = {
  readonly kind: 'exchange';
  readonly startedAt: string;
  readonly context?: JsonObject;
  readonly capture?: {
    readonly procedure: string;
    readonly summary: string;
  };
};

export type MessagePart =
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'tool';
      readonly callId: string;
      readonly name: string;
      readonly input: JsonValue;
      readonly status: 'running' | 'complete' | 'failed';
      readonly output?: JsonValue;
      readonly error?: string;
    };

export type MessageData =
  | {
      readonly kind: 'message';
      readonly role: 'user';
      readonly at: string;
      readonly text: string;
    }
  | {
      readonly kind: 'message';
      readonly role: 'agent';
      readonly at: string;
      readonly status: 'running' | 'complete' | 'stopped' | 'failed' | 'interrupted';
      readonly parts: readonly MessagePart[];
      readonly model?: string;
      readonly tokens?: { readonly in: number; readonly out: number };
      readonly error?: string;
    };

/** Structural endpoints are held in parent and target, outside this JSON. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ChatReferenceData = {
  readonly kind: 'reference';
  readonly role: 'topic' | 'place';
};

export type ChatData = ConversationData | ExchangeData | MessageData | ChatReferenceData;
export type ChatNodeVersion = NodeVersion<ChatData>;
