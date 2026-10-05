// ai.chat over OpenAI's Responses API: messages become input items, tools are flat function tools, and a
// reasoning model's output items (with its encrypted reasoning) come back as the turn's `state`, to be
// sent back unchanged, since nothing is stored at OpenAI (store: false).
import type { ChatRequest, ChatResult, ToolCall } from '@contracts/ai.chat';

type Item = Record<string, unknown>;

export function toResponsesBody(req: ChatRequest, model: string) {
  const input: Item[] = [];
  for (const m of req.messages) {
    if (m.role === 'system' || m.role === 'user') input.push({ role: m.role, content: m.content });
    else if (m.role === 'tool')
      input.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content });
    else if (Array.isArray(m.state)) input.push(...(m.state as Item[]));
    else {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls ?? [])
        input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: c.arguments });
    }
  }
  return {
    model,
    input,
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
  const toolCalls: ToolCall[] = [];
  let text = '';
  for (const item of r.output) {
    if (item.type === 'function_call')
      toolCalls.push({
        id: String(item.call_id),
        name: String(item.name),
        arguments: String(item.arguments ?? ''),
      });
    if (item.type === 'message')
      for (const part of (item.content as Item[] | undefined) ?? [])
        if (part.type === 'output_text') text += String(part.text);
  }
  return {
    content: text || null,
    toolCalls,
    usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
    state: r.output,
  };
}
