// A local model adapter exercises the real conversation and tools without keys or network requests.
import type { LanguageModel } from 'ai';

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
    const created = results.find((result) => result.toolName === 'createNode');
    const createdData = created?.output.type === 'json' ? created.output.value : null;
    const node =
      createdData && typeof createdData === 'object' && 'node' in createdData
        ? String(createdData.node)
        : '';
    let parts: StreamPart[];
    if (writing && !created) {
      parts = [
        ...text('I’ll publish this as a content node in the fictional Vault.'),
        call('createNode', { title: 'Preview thought', text: said }),
      ];
    } else if (writing && !results.some((result) => result.toolName === 'readNode')) {
      parts = [call('readNode', { node })];
    } else if (writing && !results.some((result) => result.toolName === 'updateNode')) {
      parts = [
        call('updateNode', {
          node,
          title: 'Preview thought',
          text: `${said}\nLeave room to revisit this thought.`,
        }),
      ];
    } else {
      parts = text(
        writing
          ? 'Filed in **Preview thought**, a content node with its original and updated versions retained. The tool receipts identify the accepted transactions.\n\nReload to reopen this accepted conversation, or use **Reset demo** to clear the fictional history.'
          : 'Your sample vault has notes about **Slow mornings**, **Garden studio**, and a **Reading list**.\n\nThis is a scripted design preview. Try **“vault it: leave space for a walk before work”** to create, read and update a fictional content node.',
      );
    }
    const toolCalls = parts.some((part) => part.type === 'tool-call');
    let index = -1;
    return Promise.resolve({
      stream: new ReadableStream<StreamPart>({
        async pull(controller) {
          await new Promise((resolve) =>
            setTimeout(resolve, /slow response/i.test(said) && results.length ? 300 : 35),
          );
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
