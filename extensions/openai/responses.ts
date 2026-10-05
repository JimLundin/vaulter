// OpenAI's Responses API, turn by turn: messages become input items, functions are flat function tools,
// and a reasoning model's output items (with its encrypted reasoning) come back as the turn's `state`,
// to be sent back unchanged, since nothing is stored at OpenAI (store: false).

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
      /** This turn's own output, from TurnResult.state: sent back unchanged, so the model keeps its
       * train of thought across calls. */
      state?: unknown;
    }
  | { role: 'tool'; toolCallId: string; content: string };

export interface TurnRequest {
  messages: Message[];
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  /** A JSON answer matching this schema. */
  responseSchema?: { name: string; schema: Record<string, unknown> };
}

export interface TurnResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
  state?: unknown;
}

type Item = Record<string, unknown>;

/** A message as Responses input items. An assistant turn with the model's own output (its `state`)
 * goes back as that output, reasoning and tool calls included. */
function inputOf(m: Message): Item[] {
  switch (m.role) {
    case 'system':
    case 'user':
      return [{ role: m.role, content: m.content }];
    case 'tool':
      return [{ type: 'function_call_output', call_id: m.toolCallId, output: m.content }];
    default:
      if (Array.isArray(m.state)) return m.state as Item[];
      return [
        ...(m.content ? [{ role: 'assistant', content: m.content }] : []),
        ...(m.toolCalls ?? []).map((c) => ({
          type: 'function_call',
          call_id: c.id,
          name: c.name,
          arguments: c.arguments,
        })),
      ];
  }
}

export function toResponsesBody(req: TurnRequest, model: string) {
  return {
    model,
    input: req.messages.flatMap(inputOf),
    store: false,
    include: ['reasoning.encrypted_content'],
    ...(req.tools?.length
      ? {
          tools: req.tools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            // Schemas made from Zod aren't always strict-mode schemas (optional fields).
            strict: false,
          })),
        }
      : {}),
    ...(req.responseSchema
      ? {
          text: {
            format: {
              type: 'json_schema',
              name: req.responseSchema.name,
              schema: req.responseSchema.schema,
              strict: false,
            },
          },
        }
      : {}),
  };
}

interface Response {
  output: Item[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function fromResponse(r: Response): TurnResult {
  const toolCalls: ToolCall[] = r.output
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      id: String(item.call_id),
      name: String(item.name),
      arguments: String(item.arguments ?? ''),
    }));
  const text = r.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => (item.content as Item[] | undefined) ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => String(part.text))
    .join('');
  return {
    content: text || null,
    toolCalls,
    usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
    state: r.output,
  };
}
