// The agent: Vaulter. It hands the model every extension's tools, as `<extension>__<tool>`, and the
// model calls them until it can answer. A tool that asks first becomes a question whose yes runs it,
// also after a restart (catalog.ts).

import { type Fn, model } from '#extensions/openai';
import type { Agent, Step } from './api.ts';
import { askFirst, tools } from './catalog.ts';

export * from './api.ts';

const INSTRUCTIONS = `You are Vaulter, a personal assistant that keeps a wiki from the notes a person speaks or types.
Answer from what the extensions know, using their tools; never guess or invent. Cite the notes facts come from when it helps.
Some tools ask the person first: the change is made only once they say yes. Say so, and do not try another way around.
Answer briefly, in the person's language.`;

/** Every tool, as a function the model can call. */
const fns = (): Fn[] =>
  [...tools()].flatMap(([extension, held]) =>
    [...held.values()].map((t) => ({
      name: `${extension}__${t.name}`,
      description: `${t.description}${t.access === 'ask' ? ' (asks the person first)' : ''}`,
      input: t.input,
      call: async (input) =>
        t.access === 'ask'
          ? {
              asked: await askFirst(
                { extension, tool: t.name, input: input as never },
                t.description,
              ),
            }
          : t.run(input),
    })),
  );

export const agent: Agent = {
  async ask(req, onStep) {
    const steps: Step[] = [];
    const answer = await model.answer({
      instructions: INSTRUCTIONS,
      prompt: req.prompt,
      fns: fns(),
      async onCall({ name, ...call }) {
        // An extension's id has no _, so the first __ ends it.
        const at = name.indexOf('__');
        const step = {
          extension: name.slice(0, at),
          tool: name.slice(at + 2),
          ...call,
        };
        steps.push(step);
        await onStep?.(step);
      },
    });
    return { text: answer.text, steps, usage: answer.usage };
  },
};
