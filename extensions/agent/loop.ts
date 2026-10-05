// Vaulter's loop: the model sees a line about every extension with tools, opens the ones a request needs,
// and calls their tools until it can answer. Tools reach the model as `<extension>__<tool>`.

import { z } from 'zod';
import type { Answer, AskRequest, Step } from '#contracts/agent';
import type { ChatV1, Message } from '#contracts/ai.chat';
import { askFirst, guide, tools } from './catalog.ts';

const INSTRUCTIONS = `You are Vaulter, a personal assistant that keeps a wiki from the notes a person speaks or types.
Answer from what the extensions know, using their tools; never guess or invent. Cite the notes facts come from when it helps.
Open an extension (open_extension) before using its tools; open only what the request needs.
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

/** The functions the model may call now: open an extension, or a tool of one already opened. */
const offered = (all: Tools, opened: Set<string>) => [
  // Offered only when there is something to open: a model may refuse an empty choice.
  ...(all.size
    ? [
        {
          name: 'open_extension',
          description: 'Load an extension’s tools, by its id from the list.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string', enum: [...all.keys()] } },
            required: ['id'],
          },
        },
      ]
    : []),
  ...[...opened].flatMap((ext) =>
    [...(all.get(ext)?.values() ?? [])].map((t) => ({
      name: name(ext, t.name),
      description: `${t.description}${t.access === 'ask' ? ' (asks the person first)' : ''}`,
      parameters: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }),
    })),
  ),
];

/** One function call the model made, answered: what goes back to it as the tool's output. */
async function answer(
  call: Call,
  all: Tools,
  opened: Set<string>,
  step: (s: Step) => Promise<void>,
): Promise<unknown> {
  const input = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
  if (call.name === 'open_extension') {
    const id = String(input.id);
    const tools = all.get(id);
    if (!tools) throw new Error(`no extension "${id}" with tools`);
    opened.add(id);
    await step({ kind: 'open', extension: id });
    return { opened: id, tools: [...tools.keys()] };
  }
  // An extension's id has no _, so the first __ ends it.
  const at = call.name.indexOf('__');
  const [ext, tool] = [call.name.slice(0, at), call.name.slice(at + 2)];
  const t = opened.has(ext) ? all.get(ext)?.get(tool) : undefined;
  if (!t) throw new Error(`open ${ext} first, or no tool ${call.name}`);
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
  await step({ kind: 'tool', extension: ext, tool, input, ...(error ? { error } : { output }) });
  return error ? { error } : output;
}

export async function ask(
  chat: ChatV1,
  req: AskRequest,
  onStep?: (s: Step) => unknown,
): Promise<Answer> {
  const all = tools();
  const lines = [...all].map(([ext, held]) => `- ${ext}: ${guide(ext)} (${held.size} tools)`);
  const messages: Message[] = [
    { role: 'system', content: `${INSTRUCTIONS}\n\nExtensions:\n${lines.join('\n') || '(none)'}` },
    { role: 'user', content: req.prompt },
  ];
  const opened = new Set<string>();
  const steps: Step[] = [];
  const usage = { input: 0, output: 0 };
  const step = async (s: Step) => {
    steps.push(s);
    await onStep?.(s);
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    const r = await chat.complete({ messages, tools: offered(all, opened) });
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
      const output = await answer(call, all, opened, step).catch((e: Error) => ({
        error: e.message,
      }));
      messages.push({ role: 'tool', toolCallId: call.id, content: show(output) });
    }
  }
  return { text: 'That took too many steps; ask again more narrowly.', steps, usage };
}
