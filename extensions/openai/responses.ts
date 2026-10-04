// ai.chat over OpenAI's Responses API: messages become input items, tools are flat function tools, and a
// reasoning model's output items (with its encrypted reasoning) come back as the turn's `state`, to be
// sent back unchanged, since nothing is stored at OpenAI (store: false).
import type { ChatRequest, ChatResult, Delta, ToolCall } from '@contracts/ai.chat';
import { ChatRequest as ChatRequestSchema } from '@contracts/ai.chat';

type Item = Record<string, unknown>;

export function toResponsesBody(raw: ChatRequest, model: string, stream: boolean) {
  const req = ChatRequestSchema.parse(raw);
  const input: Item[] = [];
  for (const m of req.messages) {
    if (m.role === 'system' || m.role === 'user') input.push({ role: m.role, content: m.content });
    else if (m.role === 'tool')
      input.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content });
    else if (Array.isArray(m.state)) input.push(...(m.state as Item[]));
    else {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls)
        input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: c.arguments });
    }
  }
  const choice = req.toolChoice;
  return {
    model: req.model ?? model,
    input,
    stream,
    store: false,
    include: ['reasoning.encrypted_content'],
    ...(req.tools.length
      ? {
          tools: req.tools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            // Schemas made from Zod aren't always strict-mode schemas (optional fields).
            strict: false,
          })),
          tool_choice:
            typeof choice === 'string' ? choice : { type: 'function', name: choice.name },
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
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
    ...(req.maxTokens === undefined ? {} : { max_output_tokens: req.maxTokens }),
    ...(req.reasoning === undefined ? {} : { reasoning: { effort: req.reasoning } }),
  };
}

interface Response {
  model: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
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
  const reason = r.incomplete_details?.reason;
  return {
    content: text || null,
    toolCalls,
    stop: toolCalls.length
      ? 'tool'
      : reason === 'max_output_tokens'
        ? 'length'
        : reason === 'content_filter'
          ? 'filter'
          : 'end',
    usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
    model: r.model,
    state: r.output,
  };
}

/** Reads a streamed response (server-sent events), passing each piece to `onDelta`. */
export async function readStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (d: Delta) => unknown,
): Promise<ChatResult> {
  const reader = body
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .getReader();
  let buffer = '';
  let done: ChatResult | undefined;
  const handle = async (data: string) => {
    const e = JSON.parse(data) as Item;
    switch (e.type) {
      case 'response.output_text.delta':
        await onDelta({ text: String(e.delta) });
        break;
      case 'response.output_item.added': {
        const item = e.item as Item;
        if (item.type === 'function_call')
          await onDelta({
            toolCall: {
              index: Number(e.output_index),
              id: String(item.call_id),
              name: String(item.name),
            },
          });
        break;
      }
      case 'response.function_call_arguments.delta':
        await onDelta({ toolCall: { index: Number(e.output_index), arguments: String(e.delta) } });
        break;
      case 'response.completed':
      case 'response.incomplete':
        done = fromResponse(e.response as Response);
        break;
      case 'response.failed':
      case 'error': {
        const err = (e.error ?? (e.response as Item | undefined)?.error) as Item | undefined;
        throw new Error(`OpenAI: ${String(err?.message ?? e.type)}`);
      }
      default:
    }
  };
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a stream is read in order
    const { value, done: end } = await reader.read();
    if (value) buffer += value;
    let at = buffer.indexOf('\n\n');
    while (at >= 0) {
      const event = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const data = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data && data !== '[DONE]') await handle(data);
      at = buffer.indexOf('\n\n');
    }
    if (end) break;
  }
  if (!done) throw new Error('OpenAI: the stream ended before the response completed');
  return done;
}
