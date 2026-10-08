// A local model adapter exercises the real conversation and tools without keys or network requests.
import type { LanguageModel } from 'ai';
import { note } from './data.ts';

type PreviewModel = Extract<LanguageModel, { specificationVersion: 'v4' }>;
type StreamPart =
  Awaited<ReturnType<PreviewModel['doStream']>>['stream'] extends ReadableStream<infer Part>
    ? Part
    : never;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const call = (name: string, input: unknown): StreamPart => ({
  type: 'tool-call',
  toolCallId: crypto.randomUUID(),
  toolName: name,
  input: JSON.stringify(input),
});
const text = (value: string): StreamPart[] => [
  { type: 'text-start', id: 'reply' },
  ...value
    .match(/.{1,24}/gs)!
    .map((delta): StreamPart => ({ type: 'text-delta', id: 'reply', delta })),
  { type: 'text-end', id: 'reply' },
];

export const previewModel: PreviewModel = {
  specificationVersion: 'v4',
  provider: 'preview',
  modelId: 'Scripted preview',
  supportedUrls: {},
  doGenerate: () => Promise.reject(new Error('The preview uses streaming.')),
  doStream: ({ prompt, abortSignal }) => {
    const user = prompt.findLast((message) => message.role === 'user');
    const said =
      user?.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('') ?? '';
    const from = prompt.lastIndexOf(user!);
    const results = prompt
      .slice(from + 1)
      .flatMap((message) =>
        message.role === 'tool'
          ? message.content.filter((part) => part.type === 'tool-result')
          : [],
      );
    const writing = /vault it|file this|capture|remember|sign-off/i.test(said);
    let parts: StreamPart[];
    if (!results.length) {
      parts = [
        ...text(
          writing
            ? 'I’ll add this to the sample vault, then check and commit it.'
            : 'Let me look through the sample notes.',
        ),
        writing
          ? call('writeFile', { path: 'Preview thought.md', text: note('Preview thought', said) })
          : call('search', { query: /garden/i.test(said) ? 'garden' : 'morning' }),
      ];
    } else if (writing && !results.some((result) => result.toolName === 'check')) {
      parts = [call('check', {})];
    } else if (writing && !results.some((result) => result.toolName === 'commit')) {
      const checked = results.findLast((result) => result.toolName === 'check');
      const hasProblems =
        checked?.output.type === 'json' &&
        JSON.stringify(checked.output.value).includes('"problems":["');
      parts = hasProblems
        ? text(
            'The sample check found problems in this text. Nothing was committed. Start a new chat to review the pending changes, or use **Reset demo**.',
          )
        : [call('commit', { message: 'Capture a sample thought' })];
    } else {
      const committed = results.findLast((result) => result.toolName === 'commit');
      const failed = committed && JSON.stringify(committed.output).includes('"error"');
      parts = text(
        failed
          ? 'The sample commit was refused. The tool result shows why; your edits remain staged. Use **Reset demo** to start over.'
          : writing
            ? 'Filed in **Preview thought.md**. You can open **History** to inspect the sample commit or revert it.\n\nReload or use **Reset demo** to start over.'
            : 'Your sample vault has notes about **Slow mornings**, **Garden studio**, and a **Reading list**.\n\nThis is a scripted design preview. Try **“vault it: leave space for a walk before work”** to see a write, check, and commit, or explore search, History, and the conversation panel.',
      );
    }
    const toolCalls = parts.some((part) => part.type === 'tool-call');
    let index = -1;
    return Promise.resolve({
      stream: new ReadableStream<StreamPart>({
        async pull(controller) {
          await new Promise((resolve) => setTimeout(resolve, 35));
          if (abortSignal?.aborted) {
            controller.error(abortSignal.reason);
            return;
          }
          if (index === -1) controller.enqueue({ type: 'stream-start', warnings: [] });
          else if (index < parts.length) controller.enqueue(parts[index]);
          else {
            controller.enqueue({
              type: 'finish',
              usage,
              finishReason: { unified: toolCalls ? 'tool-calls' : 'stop', raw: undefined },
            });
            controller.close();
          }
          index++;
        },
      }),
    });
  },
};
