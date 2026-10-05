// Chat with a language model: messages in, a message (with any tool calls) out. Provided by an AI
// extension (openai); the agent and the wiki's reviser require it. The model is the provider's to
// choose; a request says what to send and, for a JSON answer, its schema.

export interface ToolCall {
  id: string;
  name: string;
  /** The arguments as the model wrote them: JSON text. */
  arguments: string;
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: ToolCall[];
      /** The provider's own record of this turn (a reasoning model's reasoning), from ChatResult.state:
       * sent back unchanged, so the model keeps its train of thought across tool calls. */
      state?: unknown;
    }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ChatRequest {
  messages: Message[];
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  /** A JSON answer matching this schema. */
  responseSchema?: { name: string; schema: Record<string, unknown> };
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
  /** To send back with this turn as an assistant message (see Message). */
  state?: unknown;
}

export interface ChatV1 {
  complete: (req: ChatRequest) => Promise<ChatResult>;
}
