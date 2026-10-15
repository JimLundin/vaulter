// Application payloads stored in the common node model, independent of model SDKs and storage.
import type { JsonValue, NodeVersion } from '../../../vault/nodes/model.ts';
import type { TransactionKind } from '../../../vault/nodes/operations.ts';
import type { Precision } from '../../../vault/records/common.ts';
import type { NodeDifference } from '../../../vault/nodes/store.ts';
import type { MessageInput, MetadataData, MetadataReferenceData } from './chat-metadata.ts';

declare module '../../../vault/nodes/operations.ts' {
  interface TransactionActions {
    readonly chat:
      | 'submit'
      | 'completeResponse'
      | 'stopResponse'
      | 'checkpointResponse'
      | 'recordMetadata';
  }
}

export const chatOperations = {
  submit: { scope: 'chat', action: 'submit' },
  completeResponse: { scope: 'chat', action: 'completeResponse' },
  stopResponse: { scope: 'chat', action: 'stopResponse' },
  checkpointResponse: { scope: 'chat', action: 'checkpointResponse' },
  recordMetadata: { scope: 'chat', action: 'recordMetadata' },
} as const satisfies Readonly<
  Record<
    'submit' | 'completeResponse' | 'stopResponse' | 'checkpointResponse' | 'recordMetadata',
    TransactionKind
  >
>;

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ConversationData = {
  readonly kind: 'conversation';
  readonly title: string;
  readonly createdAt: string;
  readonly createdAtPrecision?: Precision;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ExchangeData = {
  readonly kind: 'exchange';
  readonly startedAt: string;
  readonly startedAtPrecision?: Precision;
  readonly endedAt?: string;
  /** Observations are independently recorded children; this instant describes submission. */
  readonly time?: { readonly timezone: string; readonly offsetMinutes: number };
  readonly summary?: string;
  /** Text of an imported record outside its turns. */
  readonly preamble?: string;
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
      readonly version?: string;
      readonly input: JsonValue;
      readonly status: 'running' | 'complete' | 'failed' | 'cancelled';
      readonly output?: JsonValue;
      readonly error?: string;
    };

export type MessageData =
  | {
      readonly kind: 'message';
      readonly role: 'user';
      readonly at: string;
      readonly atPrecision?: Precision;
      readonly text: string;
      readonly input?: MessageInput;
    }
  | {
      readonly kind: 'message';
      readonly role: 'agent';
      readonly at: string;
      readonly atPrecision?: Precision;
      readonly status: 'running' | 'complete' | 'stopped' | 'failed' | 'interrupted';
      readonly parts: readonly MessagePart[];
      readonly model?: string;
      readonly tokens?: { readonly in: number; readonly out: number };
      readonly error?: string;
    }
  | {
      readonly kind: 'message';
      /** Retained source material, with no inferred user or agent speaker. */
      readonly role: 'record';
      readonly at: string;
      readonly atPrecision?: Precision;
      readonly text: string;
      readonly record: { readonly kind: 'summary'; readonly label?: string };
    };

/** Structural endpoints are held in connection, independently of placement and outside this JSON. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ChatReferenceData = {
  readonly kind: 'reference';
  readonly role: 'topic' | 'place';
  /** What the record named, as written. */
  readonly label: string;
};

export type ChatData =
  | ConversationData
  | ExchangeData
  | MessageData
  | ChatReferenceData
  | MetadataData
  | MetadataReferenceData;
export type ChatNodeVersion = NodeVersion<ChatData>;

const recordKinds: ReadonlySet<string> = new Set([
  'conversation',
  'exchange',
  'message',
  'reference',
  'observation',
  'attachment',
  'interpretation',
  'metadataReference',
]);

/** Application can supply this policy to History without a History-to-Chat dependency. */
export function preservesChatRecords({ before, after }: NodeDifference): boolean {
  return [before, after].every(
    (version) =>
      version?.data == null ||
      typeof version.data.kind !== 'string' ||
      !recordKinds.has(version.data.kind),
  );
}
