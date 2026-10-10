import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { generateSuggestions } from './suggestions.ts';

const note = (path: string, summary: string) => ({
  path,
  text: `---\nsummary: ${summary}\n---\n# ${path.slice(0, -3)}\n\nBODY MUST NOT BE SENT`,
});
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

test('generates validated suggestions with bounded note context and no tools', async () => {
  const languageModel = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggestions: [
              ' What connects Alpha and Beta? ',
              '',
              'What connects Alpha and Beta?',
              'x'.repeat(71),
              'Two\nlines',
              'Help me reflect on my notes',
            ],
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    }),
  });
  const provider = vi.fn(async () => languageModel);
  const suggestions = await generateSuggestions(
    provider,
    'chosen-model',
    {
      files: [
        note('Alpha.md', 'Alpha summary'),
        note('Beta.md', 'Beta summary'),
        note('meta/private.md', 'META MUST NOT BE SENT'),
        ...Array.from({ length: 25 }, (_, i) => note(`Note ${i}.md`, 'x'.repeat(300))),
      ],
      turns: Array.from({ length: 10 }, (_, i) => ({
        role: 'user',
        text: `turn ${i} ${'x'.repeat(900)}`,
      })),
    },
    new AbortController().signal,
  );
  expect(provider).toHaveBeenCalledWith('chosen-model');
  expect(suggestions).toEqual(['What connects Alpha and Beta?', 'Help me reflect on my notes']);
  const [call] = languageModel.doGenerateCalls;
  expect(call.tools ?? []).toEqual([]);
  expect(JSON.stringify(call.prompt)).not.toContain('BODY MUST NOT BE SENT');
  expect(JSON.stringify(call.prompt)).not.toContain('META MUST NOT BE SENT');
  const user = call.prompt.find((message) => message.role === 'user');
  const part = user?.content[0];
  if (part?.type !== 'text') throw new Error('Expected context');
  const context = JSON.parse(part.text);
  expect(context.notes).toHaveLength(20);
  expect(context.notes[2].summary).toHaveLength(200);
  expect(context.conversation).toHaveLength(6);
  expect(context.conversation[0].text).toHaveLength(800);
});

test('does not load a model for an aborted suggestion request', async () => {
  const provider = vi.fn();
  const abort = new AbortController();
  abort.abort();
  await expect(
    generateSuggestions(provider, 'chosen-model', { files: [], turns: [] }, abort.signal),
  ).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
});
