// Vaulter itself: ask in words, and it uses the extensions' tools (agent.tools) to answer or to act. Each
// tool's access applies to every call it makes (read, write logged, ask approved first), enforced by
// the kernel, not by the agent.
import { defineContract } from '#kernel';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskRequest {
  prompt: string;
  /** The conversation so far. */
  history?: Turn[];
  /** What the person is looking at, for "this" and "here". */
  context?: string;
}

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

export const agent = defineContract<AgentV1>({ name: 'agent', version: 1 });
