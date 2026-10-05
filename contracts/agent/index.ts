// Vaulter itself: ask in words, and it uses the extensions' tools (agent.tools) to answer or to act. Each
// tool's access applies to every call it makes: read and write run, ask asks the person first, as a
// question, and runs when they say yes.

export interface AskRequest {
  prompt: string;
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
