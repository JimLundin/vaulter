import type { JsonValue } from '@/core/store/index.ts';
import type { RecordEmbed } from '@/core/embeds/index.ts';
import type { Precision } from '@/modules/conversation/retained-values.ts';

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

export type MessageData = { readonly embeds?: readonly RecordEmbed[] } & (
  | {
      readonly kind: 'message';
      readonly role: 'user';
      readonly at: string;
      readonly atPrecision?: Precision;
      readonly text: string;
      readonly input?: JsonValue;
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
    }
);
