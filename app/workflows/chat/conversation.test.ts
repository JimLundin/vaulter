// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createConversation } from './conversation.ts';
import { liveVault, type OwnedVault } from '../../vault/index.ts';
import { writerCore, type Writer } from '../../vault/changes/writer.ts';
import { memoryBackend } from '../../vault/storage/memory.ts';
import { vaultRules } from '../../vault/validation/rules.ts';
import { SCHEMA } from '../../vault/documents/notes/schema.fixture.ts';
import { toast } from 'sonner';
import type { SuggestionProvider } from './suggestions.ts';
import { bindVoiceDraft } from './dictation.ts';
import { createTranscription, type TranscriptionEvents } from './transcription.ts';
vi.mock('./meta.ts', () => ({ collect: async () => ({ groups: {} }), appVersion: () => 'test' }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
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
    update: core.update,
    write: core.write,
    unstage: core.unstage,
    discard: core.discard,
    commit: core.commit,
    revert: core.revert,
    history: memory.backend.history,
    patch: memory.backend.patch,
    current: () => ({ base: head.files, overlay: core.overlay }),
    problems: core.problems,
  });
  return { vault: liveVault(writer), core, ...memory };
}

test('dictation updates the shared draft with corrected final text and appends after manual edits', async () => {
  const { vault } = await setup();
  const conversation = createConversation({ vault, model: null });
  let events!: TranscriptionEvents;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({
      close: vi.fn(),
      finish: () => Promise.resolve('Corrected sentence.'),
    });
  });
  const unbind = bindVoiceDraft(conversation, voice);
  conversation.setDraft('Typed introduction.');
  await voice.start();
  events.text('Partial');
  expect(conversation.snapshot().draft).toBe('Typed introduction. Partial');
  events.text('Partial sentence');
  await voice.finish();
  expect(conversation.snapshot().draft).toBe('Typed introduction. Corrected sentence.');
  expect(conversation.snapshot().turns).toEqual([]);
  voice.clear();
  conversation.setDraft('Manually edited.\n');
  await voice.start();
  events.text('More words');
  expect(conversation.snapshot().draft).toBe('Manually edited.\nMore words');
  voice.clear();
  events.text('Late words');
  expect(conversation.snapshot().draft).toBe('Manually edited.\nMore words');
  unbind();
  voice.dispose();
  conversation.dispose();
});

test('capture failures and interruption preserve dictated text without replacing manual corrections', async () => {
  const { vault } = await setup();
  const conversation = createConversation({ vault, model: null });
  let events!: TranscriptionEvents;
  let final!: (text: string) => void;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({
      close: vi.fn(),
      finish: () =>
        new Promise<string>((resolve) => {
          final = resolve;
        }),
    });
  });
  const unbind = bindVoiceDraft(conversation, voice);
  await voice.start();
  events.text('Keep these words');
  events.error(new Error('Disconnected'));
  expect(conversation.snapshot().draft).toBe('Keep these words');
  conversation.setDraft('Edited after failure.');
  await voice.start();
  events.text('More speech');
  const finishing = voice.finish();
  voice.interrupt();
  conversation.setDraft('Corrected after interruption.');
  final('Late corrected transcript');
  await finishing;
  expect(conversation.snapshot().draft).toBe('Corrected after interruption.');
  expect(conversation.snapshot().turns).toEqual([]);
  unbind();
  voice.dispose();
  conversation.dispose();
});

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
  await conversation.send('what are the rules?', undefined, [
    {
      path: 'meta/conventions.md',
      text: '# Updated conventions\nRULE ADDED AFTER THE CONTROLLER WAS CREATED',
    },
  ]);
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

test('a turn refuses unrelated staging before constructing tools, and accepts the reviewed changes', async () => {
  const { vault, core } = await setup();
  await core.stage('meta/pending.md', '# Pending');
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Reviewed')] });
  const tools = vi.fn(() => ({}));
  const conversation = createConversation({ vault, model: async () => languageModel, tools });
  await conversation.send('file this');
  expect(conversation.snapshot().turns.at(-1)?.error).toContain('Review the staged changes');
  expect(tools).not.toHaveBeenCalled();
  expect(languageModel.doStreamCalls).toHaveLength(0);
  expect(vault.staged()).toEqual(['meta/pending.md']);
  const reviewed = conversation.stagedChanges();
  expect(reviewed).toEqual([{ path: 'meta/pending.md', before: '', text: '# Pending' }]);
  await conversation.send('include these', undefined, reviewed);
  expect(tools).toHaveBeenCalledOnce();
  expect(languageModel.doStreamCalls).toHaveLength(1);
  conversation.dispose();
});

test('a running turn owns optional tools and releases them on stop even if a tool factory is stuck', async () => {
  const { vault, core } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Must not run')] });
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  let owned!: OwnedVault;
  const tools = vi.fn(async (current: OwnedVault) => {
    owned = current;
    await loading;
    return {};
  });
  const conversation = createConversation({ vault, model: async () => languageModel, tools });
  const sent = conversation.send('file this');
  await vi.waitFor(() => expect(tools).toHaveBeenCalledOnce());
  let nextEntered = false;
  const waiting = core.update(() => {
    nextEntered = true;
    return [{ path: 'meta/next.md', text: '# Next owner' }];
  });
  await Promise.resolve();
  expect(nextEntered).toBe(false);
  expect(owned).not.toBe(vault);
  conversation.stop();
  await sent;
  await waiting;
  await expect(owned.stage('meta/late.md', '# Late')).rejects.toThrow(/abort/i);
  release();
  await Promise.resolve();
  expect(languageModel.doStreamCalls).toHaveLength(0);
  expect(vault.staged()).toEqual(['meta/next.md']);
  expect(conversation.snapshot().busy).toBe(false);
  conversation.dispose();
});

test('a failed tool factory releases ownership for another sequence', async () => {
  const { vault, core } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Must not run')] });
  const conversation = createConversation({
    vault,
    model: async () => languageModel,
    tools: () => Promise.reject(new Error('tools failed')),
  });
  await conversation.send('file this');
  expect(conversation.snapshot().turns.at(-1)?.error).toBe('tools failed');
  await core.stage('meta/next.md', '# Next');
  expect(vault.staged()).toEqual(['meta/next.md']);
  conversation.dispose();
});

test('suggestions are cached per model and turn without changing staging or history', async () => {
  const { vault, core } = await setup();
  await core.stage('meta/pending.md', '# Pending');
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Look at Alpha')] });
  const suggestions = vi.fn<SuggestionProvider>(async () => ['What connects my notes?']);
  const tools = vi.fn(() => ({}));
  const conversation = createConversation({
    vault,
    model: async () => languageModel,
    suggestions,
    tools,
  });
  await conversation.suggest();
  await conversation.suggest();
  expect(suggestions).toHaveBeenCalledOnce();
  expect(conversation.snapshot().suggestions).toEqual(['What connects my notes?']);
  expect(conversation.snapshot().turns).toEqual([]);
  expect(conversation.chat.history).toEqual([]);
  expect(tools).not.toHaveBeenCalled();
  expect(vault.staged()).toEqual(['meta/pending.md']);
  localStorage.setItem('vault.agent.model', 'another-model');
  await conversation.suggest();
  expect(suggestions).toHaveBeenCalledTimes(2);
  await core.discard();
  await conversation.send('What do I know?');
  await conversation.suggest();
  expect(suggestions).toHaveBeenCalledTimes(3);
  expect(suggestions.mock.calls[2]?.[0].turns).toEqual([
    { role: 'user', text: 'What do I know?' },
    { role: 'agent', text: 'Look at Alpha' },
  ]);
  conversation.dispose();
});

test('new chats and disposal discard late suggestions', async () => {
  const { vault } = await setup();
  const languageModel = new MockLanguageModelV4();
  let release!: (suggestions: string[]) => void;
  const pending = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  let releaseAfterDispose!: (suggestions: string[]) => void;
  const afterDispose = new Promise<string[]>((resolve) => {
    releaseAfterDispose = resolve;
  });
  const suggestions = vi
    .fn<SuggestionProvider>()
    .mockReturnValueOnce(pending)
    .mockReturnValueOnce(afterDispose);
  const conversation = createConversation({ vault, model: async () => languageModel, suggestions });
  const requested = conversation.suggest();
  const signal = suggestions.mock.calls[0]?.[1];
  conversation.newChat();
  expect(signal?.aborted).toBe(true);
  release(['Old chat suggestion']);
  await requested;
  expect(conversation.snapshot().suggestions).toEqual([]);
  const next = conversation.suggest();
  expect(suggestions).toHaveBeenCalledTimes(2);
  const nextSignal = suggestions.mock.calls[1]?.[1];
  conversation.dispose();
  expect(nextSignal?.aborted).toBe(true);
  releaseAfterDispose(['Disposed suggestion']);
  await next;
  expect(conversation.snapshot().suggestions).toEqual([]);
  await conversation.suggest();
  expect(suggestions).toHaveBeenCalledTimes(2);
});

test('sending a message cancels pending suggestions without delaying the agent', async () => {
  const { vault } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Hello')] });
  let release!: (suggestions: string[]) => void;
  const pending = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  const suggestions = vi.fn<SuggestionProvider>(() => pending);
  const conversation = createConversation({ vault, model: async () => languageModel, suggestions });
  const requested = conversation.suggest();
  const signal = suggestions.mock.calls[0]?.[1];
  await conversation.send('Hello');
  expect(signal?.aborted).toBe(true);
  expect(conversation.snapshot().busy).toBe(false);
  release(['Stale suggestion']);
  await requested;
  expect(conversation.snapshot().suggestions).toEqual([]);
  conversation.dispose();
});

test('a failed suggestion request keeps message entry and agent turns available', async () => {
  const { vault } = await setup();
  const languageModel = new MockLanguageModelV4({ doStream: [textStep('Still works')] });
  const conversation = createConversation({
    vault,
    model: async () => languageModel,
    suggestions: () => Promise.reject(new Error('offline')),
  });
  await conversation.suggest();
  expect(conversation.snapshot().suggestions).toEqual([]);
  expect(conversation.snapshot().busy).toBe(false);
  await conversation.send('Hello');
  expect(conversation.snapshot().turns.at(-1)?.parts).toEqual([
    { kind: 'text', text: 'Still works' },
  ]);
  conversation.dispose();
});
