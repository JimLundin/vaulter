// Pip itself: ask in words, and it uses the extensions' tools (agent.tools) to answer or to act. Each
// tool's access applies to every call it makes (read, write logged, ask approved first), enforced by
// the kernel, not by the agent.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const Turn = z.object({ role: z.enum(['user', 'assistant']), content: z.string() });
export type Turn = z.infer<typeof Turn>;

export const AskRequest = z.object({
  prompt: z.string().min(1),
  /** The conversation so far. */
  history: z.array(Turn).default([]),
  /** What the person is looking at, for "this" and "here". */
  context: z.string().max(8000).optional(),
});
export type AskRequest = z.input<typeof AskRequest>;

export type Step =
  | { kind: 'open'; extension: string }
  | {
      kind: 'tool';
      extension: string;
      tool: string;
      input: unknown;
      output?: unknown;
      error?: string;
    };

export interface Answer {
  text: string;
  steps: Step[];
  usage: { input: number; output: number };
}

export interface AgentV1 {
  ask: (req: AskRequest, onStep?: (step: Step) => void) => Promise<Answer>;
}

export const agent = defineContract<AgentV1>({
  name: 'agent',
  version: '1.0.0',
  inputs: {
    ask: z.tuple([
      AskRequest,
      z.custom<(s: Step) => void>((f) => typeof f === 'function').optional(),
    ]),
  },
});
