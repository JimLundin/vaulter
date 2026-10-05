// ai.chat over OpenAI's Responses API: messages become input items, tools are flat function tools, and a
// reasoning model's output items (with its encrypted reasoning) come back as the turn's `state`, to be
// sent back unchanged, since nothing is stored at OpenAI (store: false).
import type { ChatRequest, ChatResult, Message, ToolCall } from '#contracts/ai.chat';

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

export function toResponsesBody(req: ChatRequest, model: string) {
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

export function fromResponse(r: Response): ChatResult {
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
