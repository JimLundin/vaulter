// Vaulter's loop: the model sees a line about every extension with tools, opens the ones a request needs,
// and calls their tools until it can answer. Tools reach the model as `<extension>__<tool>`.

import { z } from 'zod';
import type { Answer, AskRequest, Step } from '#contracts/agent';
import type { HeldTool } from '#contracts/agent.tools';
import type { ChatV1, Message } from '#contracts/ai.chat';
import { Declined } from '#kernel';

const INSTRUCTIONS = `You are Vaulter, a personal assistant that keeps a wiki from the notes a person speaks or types.
Answer from what the extensions know, using their tools; never guess or invent. Cite the notes facts come from when it helps.
Open an extension (open_extension) before using its tools; open only what the request needs.
Some tools wait for the person to approve; if one is declined, say so and do not try another way around.
Answer briefly, in the person's language.`;

const MAX_STEPS = 12;
const MAX_OUTPUT = 20_000;

export interface Catalog {
  /** Tools by extension. */
  tools: Map<string, Map<string, HeldTool>>;
  /** One line per extension: what it is for. */
  guide: (extension: string) => Promise<string>;
}

const name = (ext: string, tool: string) => `${ext}__${tool}`;
const show = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}… (cut)` : s;
};

type Tools = Catalog['tools'];
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
      description: `${t.description}${t.run.level === 'ask' ? ' (asks the person first)' : ''}`,
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
    output = await t.run(t.input.parse(input));
  } catch (e) {
    error = e instanceof Declined ? 'the person declined' : (e as Error).message;
  }
  await step({ kind: 'tool', extension: ext, tool, input, ...(error ? { error } : { output }) });
  return error ? { error } : output;
}

export async function ask(
  chat: ChatV1,
  catalog: Catalog,
  req: AskRequest,
  onStep?: (s: Step) => unknown,
): Promise<Answer> {
  const all = catalog.tools;
  const lines = await Promise.all(
    [...all].map(
      async ([ext, tools]) => `- ${ext}: ${await catalog.guide(ext)} (${tools.size} tools)`,
    ),
  );
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
