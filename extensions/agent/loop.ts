// Pip's loop: the model sees a line about every extension with tools, opens the ones a request needs,
// and calls their tools until it can answer. Tools reach the model as `<extension>__<tool>`.
import type { ChatV1, Message } from '@contracts/ai.chat';
import type { AskRequest, Answer, Step } from '@contracts/agent';
import { AskRequest as AskSchema } from '@contracts/agent';
import type { HeldTool } from '@contracts/agent.tools';
import { Declined } from '@pip/kernel';
import { z } from 'zod';

export const INSTRUCTIONS = `You are Pip, a personal assistant that keeps a wiki from the notes a person speaks or types.
Answer from what the extensions know, using their tools; never guess or invent. Cite the notes facts come from when it helps.
Open an extension (open_extension) before using its tools; open only what the request needs.
Some tools wait for the person to approve; if one is declined, say so and do not try another way around.
Answer briefly, in the person's language.`;

const MAX_STEPS = 12;
const MAX_OUTPUT = 20_000;

export interface Catalog {
  /** Tools by extension. */
  tools: () => Map<string, Map<string, HeldTool>>;
  /** One line per extension: what it is for. */
  guide: (extension: string) => Promise<string>;
}

const name = (ext: string, tool: string) => `${ext}__${tool}`;
const show = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}… (cut)` : s;
};

export async function ask(
  chat: ChatV1,
  catalog: Catalog,
  raw: AskRequest,
  onStep?: (s: Step) => unknown,
): Promise<Answer> {
  const req = AskSchema.parse(raw);
  const all = catalog.tools();
  const lines = await Promise.all(
    [...all].map(
      async ([ext, tools]) => `- ${ext}: ${await catalog.guide(ext)} (${tools.size} tools)`,
    ),
  );
  const messages: Message[] = [
    { role: 'system', content: `${INSTRUCTIONS}\n\nExtensions:\n${lines.join('\n') || '(none)'}` },
    ...req.history,
    ...(req.context ? [{ role: 'user' as const, content: `On screen: ${req.context}` }] : []),
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
    const tools = [
      {
        name: 'open_extension',
        description: 'Load an extension’s tools, by its id from the list.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', enum: [...all.keys()] } },
          required: ['id'],
        },
      },
      ...[...opened].flatMap((ext) =>
        [...(all.get(ext)?.values() ?? [])].map((t) => ({
          name: name(ext, t.name),
          description: `${t.description}${t.run.level === 'ask' ? ' (asks the person first)' : ''}`,
          parameters: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }),
        })),
      ),
    ];
    // biome-ignore lint/performance/noAwaitInLoops: each turn needs the one before
    const r = await chat.complete({ messages, tools });
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    messages.push({
      role: 'assistant',
      content: r.content,
      toolCalls: r.toolCalls,
      state: r.state as never,
    });
    if (!r.toolCalls.length) return { text: r.content ?? '', steps, usage };

    for (const call of r.toolCalls) {
      let output: unknown;
      try {
        const input = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
        if (call.name === 'open_extension') {
          const id = String(input.id);
          if (!all.has(id)) throw new Error(`no extension "${id}" with tools`);
          opened.add(id);
          await step({ kind: 'open', extension: id });
          output = { opened: id, tools: [...all.get(id)!.keys()] };
        } else {
          const [ext, tool] = call.name.split('__');
          const t = opened.has(ext) ? all.get(ext)?.get(tool) : undefined;
          if (!t) throw new Error(`open ${ext} first, or no tool ${call.name}`);
          try {
            output = await t.run(t.input.parse(input));
            await step({ kind: 'tool', extension: ext, tool, input, output });
          } catch (e) {
            const error = e instanceof Declined ? 'the person declined' : (e as Error).message;
            await step({ kind: 'tool', extension: ext, tool, input, error });
            output = { error };
          }
        }
      } catch (e) {
        output = { error: (e as Error).message };
      }
      messages.push({ role: 'tool', toolCallId: call.id, content: show(output) });
    }
  }
  return { text: 'That took too many steps; ask again more narrowly.', steps, usage };
}
