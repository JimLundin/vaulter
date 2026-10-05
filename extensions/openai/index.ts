// OpenAI: the language model, over the Responses API. Its key is the sealed secret "openai/key".

import { z } from 'zod';
import { secret } from '#extensions/secrets';
import type { Answer, Call, Fn, Model } from './api.ts';
import { fromResponse, type Message, type TurnRequest, toResponsesBody } from './responses.ts';

export * from './api.ts';

const API = 'https://api.openai.com/v1';

/** The model it asks. */
const MODEL = 'gpt-6.1-sol';
const MAX_STEPS = 12;
/** How much of a function's output goes back to the model. */
const MAX_OUTPUT = 20_000;

async function turn(req: TurnRequest) {
  const key = secret('openai/key');
  if (!key) throw new Error('the OpenAI key is not set: unlock this device');
  // No credentials or referrer from the app's own origin ride along, and no redirect elsewhere.
  const r = await fetch(`${API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toResponsesBody(req, MODEL)),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`OpenAI ${r.status}: ${err?.error?.message ?? r.statusText}`);
  }
  return fromResponse(await r.json());
}

const show = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}… (cut)` : s;
};

/** One call the model asked for, made: its output, or its error. */
async function made(fns: Fn[], name: string, args: string): Promise<Call> {
  const input: unknown = JSON.parse(args || '{}');
  const fn = fns.find((f) => f.name === name);
  if (!fn) return { name, input, error: `no function ${name}` };
  try {
    return { name, input, output: await fn.call(fn.input.parse(input)) };
  } catch (e) {
    return { name, input, error: (e as Error).message };
  }
}

export const model: Model = {
  async answer({ instructions, prompt, fns = [], maxSteps = MAX_STEPS, onCall }) {
    const tools = fns.map((f) => ({
      name: f.name,
      description: f.description,
      parameters: z.toJSONSchema(f.input, { io: 'input', unrepresentable: 'any' }),
    }));
    const messages: Message[] = [
      { role: 'system', content: instructions },
      { role: 'user', content: prompt },
    ];
    const answer: Answer = { text: '', calls: [], usage: { input: 0, output: 0 } };
    for (let i = 0; i < maxSteps; i++) {
      const r = await turn({ messages, tools });
      answer.usage.input += r.usage.input;
      answer.usage.output += r.usage.output;
      messages.push({
        role: 'assistant',
        content: r.content,
        toolCalls: r.toolCalls,
        state: r.state,
      });
      if (!r.toolCalls.length) return { ...answer, text: r.content ?? '' };
      for (const c of r.toolCalls) {
        const call = await made(fns, c.name, c.arguments);
        answer.calls.push(call);
        await onCall?.(call);
        const content = show(call.error ? { error: call.error } : call.output);
        messages.push({ role: 'tool', toolCallId: c.id, content });
      }
    }
    return { ...answer, text: 'That took too many steps; ask again more narrowly.' };
  },

  async json({ instructions, input, schema, name }) {
    const r = await turn({
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
      responseSchema: { name, schema: z.toJSONSchema(schema) as Record<string, unknown> },
    });
    return schema.parse(JSON.parse(r.content ?? '{}'));
  },
};
