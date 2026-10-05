// The tools Vaulter has, from what every running extension exports as `tools`, and the person's
// approval of the ones that ask first: such a call becomes a question on the agent's own topic, with
// the call as its data, and a yes runs it. The answer can come after a restart, before everything has
// started: the call waits until it has.

import type { Question } from '#extensions/questions';
import { questionsFor } from '#extensions/questions';
import { running, started } from '#kernel';
import type { Tool } from './api.ts';

const APPROVE = 'approve';
const questions = questionsFor('agent');

interface Call {
  extension: string;
  tool: string;
  input: Record<string, unknown>;
}

// A tool's name goes to the model as part of the function's name.
const named = (t: Tool<unknown>) =>
  /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(t.name) && !t.name.includes('__');

/** Tools by extension, now. */
export const tools = () =>
  new Map(
    running()
      .filter((r) => Array.isArray(r.exports.tools))
      .map((r) => [
        r.id,
        new Map((r.exports.tools as Tool<unknown>[]).filter(named).map((t) => [t.name, t])),
      ]),
  );

/** One line per extension: what it is for. */
export const guide = (id: string) =>
  running().find((r) => r.id === id)?.about.agentGuide || 'no guide';

/** Asks the person whether Vaulter may make `call`; the question's id. */
export const askFirst = (call: Call, description: string) =>
  questions.ask({
    topic: APPROVE,
    // The same call asked again while the first is open is the same question.
    key: JSON.stringify(call),
    title: `May Vaulter use ${call.extension}'s ${call.tool}?`,
    body: `${description}\n\n${JSON.stringify(call.input, null, 2)}`.slice(0, 4000),
    choices: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    data: call as never,
  });

// Not awaited: an answer waiting from before waits for everything to start, this extension included.
void questions.handle(APPROVE, async (answer, q: Question) => {
  if (answer.choice !== 'yes') return;
  await started;
  const call = q.data as unknown as Call;
  const t = tools().get(call.extension)?.get(call.tool);
  if (!t) throw new Error(`${call.extension} has no tool ${call.tool}`);
  await t.run(t.input.parse(call.input));
});
