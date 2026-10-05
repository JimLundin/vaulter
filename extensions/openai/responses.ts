// OpenAI's Responses API, one turn at a time. Nothing is stored at OpenAI
// (store: false), so each turn's own output, with the model's encrypted
// reasoning, is kept as `state` and sent back with the next.

export interface ToolCall {
  id: string;
  name: string;
  /** The arguments as the model wrote them, as JSON text. */
  arguments: string;
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: ToolCall[];
      /** The turn's own output, sent back unchanged so the model keeps its
       * train of thought. */
      state?: unknown;
    }
  | { role: 'tool'; toolCallId: string; content: string };

export interface TurnRequest {
  messages: Message[];
  tools?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
  /** For a JSON answer matching this schema. */
  responseSchema?: { name: string; schema: Record<string, unknown> };
}

export interface TurnResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
  state?: unknown;
}

type Item = Record<string, unknown>;

interface Response {
  output: Item[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** A message as input items. An assistant turn goes back as its own
 * output when it has it, reasoning and calls included. */
function itemsOf(message: Message): Item[] {
  switch (message.role) {
    case 'system':
    case 'user':
      return [{ role: message.role, content: message.content }];
    case 'tool':
      return [
        {
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: message.content,
        },
      ];
    default:
      if (Array.isArray(message.state)) {
        return message.state as Item[];
      }
      return [
        ...(message.content
          ? [{ role: 'assistant', content: message.content }]
          : []),
        ...(message.toolCalls ?? []).map((call) => ({
          type: 'function_call',
          call_id: call.id,
          name: call.name,
          arguments: call.arguments,
        })),
      ];
  }
}

function toolsOf(request: TurnRequest) {
  if (!request.tools?.length) {
    return {};
  }
  const tools = request.tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    // A schema made from Zod isn't always a strict-mode schema, because of
    // its optional fields.
    strict: false,
  }));
  return { tools };
}

function formatOf(request: TurnRequest) {
  if (!request.responseSchema) {
    return {};
  }
  const { name, schema } = request.responseSchema;
  return {
    text: { format: { type: 'json_schema', name, schema, strict: false } },
  };
}

/** The request body for one turn. */
export function bodyOf(request: TurnRequest, model: string) {
  return {
    model,
    input: request.messages.flatMap(itemsOf),
    store: false,
    include: ['reasoning.encrypted_content'],
    ...toolsOf(request),
    ...formatOf(request),
  };
}

/** One turn's result, from OpenAI's response. */
export function resultOf(response: Response): TurnResult {
  const toolCalls: ToolCall[] = response.output
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      id: String(item.call_id),
      name: String(item.name),
      arguments: String(item.arguments ?? ''),
    }));
  const text = response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => (item.content as Item[] | undefined) ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => String(part.text))
    .join('');
  return {
    content: text || null,
    toolCalls,
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    },
    state: response.output,
  };
}
