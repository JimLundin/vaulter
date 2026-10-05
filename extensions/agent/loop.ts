// Vaulter's loop: the model sees every extension's guide and tools, and calls them until it can answer.
// Tools reach the model as `<extension>__<tool>`.

import { z } from 'zod';
import type { Chat, Message } from '#extensions/openai';
import type { Answer, AskRequest, Step } from './api.ts';
import { askFirst, guide, tools } from './catalog.ts';

const INSTRUCTIONS = `You are Vaulter, a personal assistant that keeps a wiki from the notes a person speaks or types.
Answer from what the extensions know, using their tools; never guess or invent. Cite the notes facts come from when it helps.
Some tools ask the person first: the change is made only once they say yes. Say so, and do not try another way around.
Answer briefly, in the person's language.`;

const MAX_STEPS = 12;
const MAX_OUTPUT = 20_000;

const name = (ext: string, tool: string) => `${ext}__${tool}`;
const show = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}… (cut)` : s;
};

type Tools = ReturnType<typeof tools>;
type Call = { id: string; name: string; arguments: string };

/** Every tool, as the model calls it. */
const offered = (all: Tools) =>
  [...all].flatMap(([ext, held]) =>
    [...held.values()].map((t) => ({
      name: name(ext, t.name),
      description: `${t.description}${t.access === 'ask' ? ' (asks the person first)' : ''}`,
      parameters: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }),
    })),
  );

/** One function call the model made, answered: what goes back to it as the tool's output. */
async function answer(call: Call, all: Tools, step: (s: Step) => Promise<void>): Promise<unknown> {
  const input = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
  // An extension's id has no _, so the first __ ends it.
  const at = call.name.indexOf('__');
  const [ext, tool] = [call.name.slice(0, at), call.name.slice(at + 2)];
  const t = all.get(ext)?.get(tool);
  if (!t) throw new Error(`no tool ${call.name}`);
  let output: unknown;
  let error: string | undefined;
  try {
    const parsed = t.input.parse(input) as Record<string, unknown>;
    output =
      t.access === 'ask'
        ? { asked: await askFirst({ extension: ext, tool, input: parsed }, t.description) }
        : await t.run(parsed);
  } catch (e) {
    error = (e as Error).message;
  }
  await step({ extension: ext, tool, input, ...(error ? { error } : { output }) });
  return error ? { error } : output;
}

export async function ask(
  chat: Chat,
  req: AskRequest,
  onStep?: (s: Step) => unknown,
): Promise<Answer> {
  const all = tools();
  const lines = [...all.keys()].map((ext) => `- ${ext}: ${guide(ext)}`);
  const messages: Message[] = [
    { role: 'system', content: `${INSTRUCTIONS}\n\nExtensions:\n${lines.join('\n') || '(none)'}` },
    { role: 'user', content: req.prompt },
  ];
  const steps: Step[] = [];
  const usage = { input: 0, output: 0 };
  const step = async (s: Step) => {
    steps.push(s);
    await onStep?.(s);
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    const r = await chat.complete({ messages, tools: offered(all) });
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    messages.push({
      role: 'assistant',
      content: r.content,
      toolCalls: r.toolCalls,
      state: r.state,
    });
    if (!r.toolCalls.length) return { text: r.content ?? '', steps, usage };
    for (const call of r.toolCalls) {
      const output = await answer(call, all, step).catch((e: Error) => ({
        error: e.message,
      }));
      messages.push({ role: 'tool', toolCallId: call.id, content: show(output) });
    }
  }
  return { text: 'That took too many steps; ask again more narrowly.', steps, usage };
}
