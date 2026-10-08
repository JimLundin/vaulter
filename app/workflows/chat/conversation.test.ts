// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createConversation } from './conversation.ts';
import { liveVault } from '../../vault/index.ts';
import { writerCore, type Writer } from '../../vault/changes/writer.ts';
import { memoryBackend } from '../../vault/storage/memory.ts';
import { vaultRules } from '../../vault/validation/rules.ts';
import { SCHEMA } from '../../vault/documents/notes/schema.fixture.ts';
import { toast } from 'sonner';
vi.mock('./meta.ts', () => ({ collect: async () => ({ groups: {} }), appVersion: () => 'test' }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
afterEach(() => vi.clearAllMocks());
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const textStep = (text: string) => ({
  stream: convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    { type: 'text-start' as const, id: 't' },
    { type: 'text-delta' as const, id: 't', delta: text },
    { type: 'text-end' as const, id: 't' },
    { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage },
  ]),
});
async function setup() {
  const memory = memoryBackend({ ...SCHEMA, 'meta/conventions.md': '# Conventions' });
  let head = (await memory.backend.refresh())!;
  const core = writerCore(
    memory.backend,
    vaultRules,
    () => head.files,
    (next) => {
      head = next;
    },
  );
  const writer = (): Writer => ({
    base: head.files,
    overlay: core.overlay,
    stage: core.stage,
    stageMany: core.stageMany,
    unstage: core.unstage,
    discard: core.discard,
    commit: core.commit,
    revert: core.revert,
    history: memory.backend.history,
    patch: memory.backend.patch,
    current: () => ({ base: head.files, overlay: core.overlay }),
    problems: core.problems,
  });
  return { vault: liveVault(writer), core };
}

test('a controller keeps its turn after the view closes, reads it on reopening, and isolates other conversations', async () => {
  const { vault } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Filed it.')] });
  const first = createConversation({ vault, model: async () => languageModel });
  const other = createConversation({ vault, model: async () => languageModel });
  const close = first.viewing();
  const sent = first.send('remember this');
  close();
  await sent;
  expect(first.snapshot().turns.at(-1)?.parts).toEqual([{ kind: 'text', text: 'Filed it.' }]);
  expect(first.snapshot().unread).toBe(true);
  expect(other.snapshot().turns).toEqual([]);
  const closeAgain = first.viewing();
  expect(first.snapshot().unread).toBe(false);
  closeAgain();
  first.newChat();
  expect(first.snapshot().turns).toEqual([]);
  first.dispose();
  other.dispose();
});

test('a controller reads the live staged vault without needing an open view or another render', async () => {
  const { vault, core } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Done')] });
  const conversation = createConversation({ vault, model: async () => languageModel });
  await core.stage(
    'meta/conventions.md',
    '# Updated conventions\nRULE ADDED AFTER THE CONTROLLER WAS CREATED',
  );
  await conversation.send('what are the rules?');
  expect(JSON.stringify(languageModel.doStreamCalls[0].prompt)).toContain(
    'RULE ADDED AFTER THE CONTROLLER WAS CREATED',
  );
  conversation.dispose();
});

test('disposing while the model loads cancels the turn and prevents tools, notifications and new sends', async () => {
  const { vault } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Should not run')] });
  let release!: (model: MockLanguageModelV4) => void;
  const loading = new Promise<MockLanguageModelV4>((resolve) => {
    release = resolve;
  });
  const provider = vi.fn(() => loading);
  const tools = vi.fn(() => ({}));
  const conversation = createConversation({ vault, model: provider, tools });
  const listener = vi.fn();
  conversation.subscribe(listener);
  const sent = conversation.send('remember this');
  await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce());
  const signal = conversation.chat.abort!.signal;
  conversation.dispose();
  const updates = listener.mock.calls.length;
  release(languageModel);
  await sent;
  expect(signal.aborted).toBe(true);
  expect(tools).not.toHaveBeenCalled();
  expect(languageModel.doStreamCalls).toHaveLength(0);
  expect(listener).toHaveBeenCalledTimes(updates);
  expect(toast).not.toHaveBeenCalled();
  expect(conversation.ready()).toBe(false);
  await conversation.send('another');
  expect(conversation.snapshot().turns).toHaveLength(2);
});
