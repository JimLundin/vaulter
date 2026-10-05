// The tools Vaulter holds, by extension, and the person's approval of the ones that ask first: such a
// call becomes a question on the agent's own topic, with the call as its data, and a yes runs it. The
// answer can come after a restart, before the tool's extension has added it again: the call waits for
// the tool a little while, and an answer it can't run stays undelivered, to be tried on the next start.
import type { Tool } from '#contracts/agent.tools';
import type { Question, QuestionsV1 } from '#contracts/questions';

const APPROVE = 'approve';
const WAIT_MS = 10_000;

interface Call {
  extension: string;
  tool: string;
  input: Record<string, unknown>;
}

export function catalog(
  guide: (extension: string) => Promise<string>,
  questions: QuestionsV1 | undefined,
) {
  const tools = new Map<string, Map<string, Tool<unknown>>>();
  const waiting = new Map<string, (t: Tool<unknown>) => void>();
  const key = (extension: string, tool: string) => `${extension}__${tool}`;

  /** The tool, once its extension has added it. */
  const added = (extension: string, tool: string) =>
    new Promise<Tool<unknown>>((ok, fail) => {
      const t = tools.get(extension)?.get(tool);
      if (t) return ok(t);
      const k = key(extension, tool);
      const timer = setTimeout(() => {
        waiting.delete(k);
        fail(new Error(`${extension} has no tool ${tool}`));
      }, WAIT_MS);
      waiting.set(k, (found) => {
        clearTimeout(timer);
        ok(found);
      });
    });

  return {
    tools,
    guide,

    add(extension: string, tool: Tool<unknown>) {
      const mine = tools.get(extension) ?? new Map<string, Tool<unknown>>();
      tools.set(extension, mine);
      mine.set(tool.name, tool);
      waiting.get(key(extension, tool.name))?.(tool);
      waiting.delete(key(extension, tool.name));
      return () => {
        if (mine.get(tool.name) === tool) mine.delete(tool.name);
      };
    },

    /** Asks the person whether Vaulter may make `call`; the question's id. */
    askFirst(call: Call, description: string) {
      if (!questions) throw new Error('this tool asks the person first, and nothing can ask them');
      return questions.ask({
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
    },

    /** Handles the person's answers: a yes runs the call. */
    listen: () =>
      questions?.handle(APPROVE, async (answer, q: Question) => {
        if (answer.choice !== 'yes') return;
        const call = q.data as unknown as Call;
        const t = await added(call.extension, call.tool);
        await t.run(t.input.parse(call.input));
      }),
  };
}

export type Catalog = ReturnType<typeof catalog>;
