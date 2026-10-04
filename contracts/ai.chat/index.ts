// Chat with a language model: messages in, a message (with any tool calls) out. Provided by an AI
// extension (openai); the agent and anything that summarises or extracts require it.
import { defineContract } from '@vaulter/kernel';
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

export const ToolCall = z.object({ id: z.string(), name: z.string(), arguments: z.string() });
export type ToolCall = z.infer<typeof ToolCall>;

export const Message = z.discriminatedUnion('role', [
  z.object({ role: z.literal('system'), content: z.string() }),
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().nullable(),
    toolCalls: z.array(ToolCall).default([]),
    /** The provider's own record of this turn (a reasoning model's reasoning), from ChatResult.state:
     * sent back unchanged, so the model keeps its train of thought across tool calls. */
    state: z.json().optional(),
  }),
  z.object({ role: z.literal('tool'), toolCallId: z.string(), content: z.string() }),
]);
export type Message = z.input<typeof Message>;

export const ChatRequest = z.object({
  /** The provider's default when absent. */
  model: z.string().optional(),
  messages: z.array(Message).min(1),
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
  toolChoice: z
    .union([z.enum(['auto', 'none', 'required']), z.object({ name: z.string() })])
    .default('auto'),
  temperature: z.number().min(0).max(2).optional(),
  /** How hard a reasoning model thinks: more is slower and costs more. */
  reasoning: z.enum(['none', 'low', 'medium', 'high']).optional(),
  maxTokens: z.number().int().positive().optional(),
  /** A JSON answer matching this schema. */
  responseSchema: z
    .object({ name: z.string(), schema: z.record(z.string(), z.unknown()) })
    .optional(),
});
export type ChatRequest = z.input<typeof ChatRequest>;

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  stop: 'end' | 'tool' | 'length' | 'filter';
  usage: { input: number; output: number };
  model: string;
  /** To send back with this turn as an assistant message (see Message). */
  state?: unknown;
}

export interface Delta {
  text?: string;
  toolCall?: Partial<ToolCall> & { index: number };
}

export interface ChatV1 {
  complete: (req: ChatRequest) => Promise<ChatResult>;
  /** As complete, with each piece as it arrives. */
  stream: (req: ChatRequest, onDelta: (d: Delta) => void) => Promise<ChatResult>;
  models: () => Promise<string[]>;
}

export const chat = defineContract<ChatV1>({
  name: 'ai.chat',
  version: '1.0.0',
});
