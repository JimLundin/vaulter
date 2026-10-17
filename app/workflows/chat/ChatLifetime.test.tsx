// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { Text } from '@/ui/kit/index.ts';
import { createConversation } from './conversation.ts';
import { createTranscription, useTranscription } from '@/transcription.ts';
import { Chat } from './Chat.tsx';
import { ChatIndicator } from './index.tsx';
import { useConversation, useChat } from './use-conversation.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { appendExchange } from './data/operations.ts';

async function retainHistory(db: Awaited<ReturnType<typeof chatFixture>>['db'], text: string) {
  await db.transaction(async (tx) => {
    const author = await tx.entities.actors.insert({ name: 'User', kind: 'user' });
    const at = new Date('2026-10-10T12:00:00Z');
    const exchange = await appendExchange(tx, at);
    await tx.entities.messages.insert({ exchange, author, at, text });
  });
}

test('native dialogue restores recorded history without executing providers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  await retainHistory(db, 'Earlier conversation');
  const model = vi.fn(async () => {
    throw new Error('Reading must not execute');
  });
  function Surface() {
    const conversation = useConversation({
      ...options,
      selectedModel: '',
      model,
      suggestions: async () => [],
    });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface />));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain('Earlier conversation');
    expect(model).not.toHaveBeenCalled();
    expect(await db.entities.messages.query({ select: {} })).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('requested history retries a failed read when store readiness changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  await retainHistory(db, 'Retained history is readable');
  let unavailable = true;
  const backend: typeof options.backend = (input) => {
    const store = options.backend(input);
    return {
      ...store,
      messages: () =>
        unavailable ? Promise.reject(new Error('Store is opening')) : store.messages(),
    };
  };
  function Surface({ availability }: { availability: string }) {
    const conversation = useConversation({ ...options, backend, selectedModel: '', availability });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface availability="Opening the database…" />));
    expect(document.body.textContent).toContain('Store is opening');
    unavailable = false;
    await act(async () =>
      root.render(<Surface availability="Configure a model before sending." />),
    );
    expect(document.body.textContent).toContain('Retained history is readable');
    expect(document.body.textContent).not.toContain('Store is opening');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('requested history waits for the initial database read without showing a false unavailable error', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  await retainHistory(db, 'Ready history');
  let ready = false;
  const messages = vi.fn<import('./backend.ts').ChatBackend['messages']>();
  const backend: typeof options.backend = (input) => {
    const store = options.backend(input);
    messages.mockImplementation(() =>
      ready ? store.messages() : Promise.reject(new Error('Dialogue is unavailable')),
    );
    return { ...store, messages };
  };
  function Surface({ recordsReady }: { recordsReady: boolean }) {
    const conversation = useConversation({ ...options, backend, selectedModel: '', recordsReady });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface recordsReady={false} />));
    expect(messages).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    ready = true;
    await act(async () => root.render(<Surface recordsReady={true} />));
    expect(document.body.textContent).toContain('Ready history');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('a reply finishing with the mounted pane closed remains unread until it reopens', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = new MockLanguageModelV4({
    doStream: async () => {
      await waiting;
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Retained reply.' },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 2, text: 2, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const conversation = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => model,
    selectedModel: 'fictional',
    instructions: 'Record.',
  });
  const voice = createTranscription(null);
  const root = createRoot(document.body);
  const render = (open: boolean) =>
    root.render(
      <>
        <ChatIndicator conversation={conversation} />
        <Chat
          conversation={conversation}
          arg={null}
          presentation={{ open, onClose: () => undefined }}
        />
      </>,
    );
  try {
    await act(async () => render(true));
    let accepted!: Promise<void>;
    await act(async () => {
      const outcome = conversation.prepareSubmission({ text: 'A thought' });
      if (outcome.status !== 'owned') throw new Error('Expected retained request');
      accepted = outcome.done;
    });
    await act(async () => render(false));
    await act(async () => {
      release();
      await accepted;
    });
    expect(document.querySelector('[aria-label="The agent replied"]')).not.toBeNull();
    await act(async () => render(true));
    expect(document.querySelector('[aria-label="The agent replied"]')).toBeNull();
    expect(document.body.textContent).toContain('Retained reply.');
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    voice.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('retained prompts are consumed once across page and panel views, including edit-only drafts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'One retained answer.' },
        { type: 'text-end', id: 'text' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const conversation = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => model,
    selectedModel: 'fictional',
    instructions: 'Record.',
    suggestions: async () => [],
  });
  const voice = createTranscription(null);
  const root = createRoot(document.body);
  const sendPrompt = { text: 'Ask once', send: true, n: 1 };
  const editPrompt = { text: 'Draft from a suggestion', send: false, n: 2 };
  const render = (page: boolean, open: boolean, prompt = sendPrompt) =>
    root.render(
      <>
        {page && <Chat conversation={conversation} arg={prompt} presentation={{ page: true }} />}
        <Chat
          conversation={conversation}
          arg={page ? null : prompt}
          presentation={{ open, onClose: () => undefined }}
        />
      </>,
    );
  const idle = () =>
    act(async () => {
      await vi.waitFor(() => expect(conversation.snapshot().busy).toBe(false));
    });
  try {
    await act(async () => render(true, false));
    await idle();
    expect(conversation.snapshot().turns).toHaveLength(2);
    await act(async () => render(false, true));
    await idle();
    await act(async () => render(false, false));
    await act(async () => render(false, true));
    await idle();
    expect(model.doStreamCalls).toHaveLength(1);
    expect(conversation.snapshot().turns).toHaveLength(2);
    await act(async () => render(true, false, editPrompt));
    expect(conversation.snapshot().draft).toBe('Draft from a suggestion');
    await act(async () => conversation.setDraft('Edited unfinished draft'));
    await act(async () => render(false, true, editPrompt));
    expect(conversation.snapshot().draft).toBe('Edited unfinished draft');
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    voice.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('changed supplied availability reaches mounted Chat without notifying subscribers during React render', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const options = {
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Must not execute')),
    suggestions: async () => [],
  };
  function Surface({ availability }: { availability?: string }) {
    const conversation = useConversation({ ...options, availability });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await act(async () => root.render(<Surface />));
    await act(async () => root.render(<Surface availability="Saving is unavailable" />));
    expect(document.body.textContent).toContain('Saving is unavailable');
    expect(errors.mock.calls.flat().join(' ')).not.toContain('while rendering');
  } finally {
    await act(async () => root.unmount());
    errors.mockRestore();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('simultaneous and reopened Chat views retain blocked Ask with visible Use and Dismiss actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  const voice = createTranscription(async () => ({ finish: async () => 'Spoken', close() {} }));
  const conversation = createConversation({
    ...baseOptions,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Must not execute')),
    suggestions: async () => [],
    transcription: voice,
  });
  const root = createRoot(document.body);
  const prompt = { n: 1, send: true, text: 'Retained blocked Ask' };
  const render = (visible: boolean) =>
    root.render(
      <>
        {visible && <Chat conversation={conversation} arg={prompt} presentation={{ page: true }} />}
        <Chat
          conversation={conversation}
          arg={prompt}
          presentation={{ open: visible, onClose: () => undefined }}
        />
      </>,
    );
  try {
    conversation.setDraft('Preserved draft');
    await conversation.captureAction();
    await act(async () => render(true));
    expect(document.body.textContent).toContain('Retained blocked Ask');
    expect(document.body.textContent).toContain('before using this text');
    expect(
      [...document.querySelectorAll('button')].some((button) => button.textContent === 'Use'),
    ).toBe(true);
    expect(conversation.snapshot().prompts).toHaveLength(1);
    await act(async () => render(false));
    await act(async () => voice.clear());
    await act(async () => render(true));
    expect(conversation.snapshot().prompts).toHaveLength(1);
    expect(conversation.snapshot().turns).toEqual([]);
    expect(conversation.snapshot().draft).toBe('Preserved draft');
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Dismiss')!
        .click();
    });
    expect(conversation.snapshot().prompts).toEqual([]);
    expect(conversation.snapshot().draft).toBe('Preserved draft');
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    voice.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('StrictMode owns fresh Chat and recording lifetimes and replacing the Vault session retains no old task', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let transcript!: import('@/transcription.ts').TranscriptionEvents;
  let recordingClosed = false;
  const provider: import('@/transcription.ts').TranscriptionProvider = async (events) => {
    transcript = events;
    return {
      close: () => {
        recordingClosed = true;
      },
      finish: async () => 'Final speech',
    };
  };
  let current!: ReturnType<typeof useConversation>;
  function Surface({ session }: { session: object }) {
    const voice = useTranscription(provider, session);
    const conversation = useConversation({
      ...baseOptions,
      session,
      user: 'user',
      agent: 'agent',
      provider: 'fictional',
      selectedModel: '',
      model: () => Promise.reject(new Error('Reading must not execute')),
      instructions: '',
      transcription: voice,
      suggestions: async () => [],
    });
    current = conversation;
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  const first = {};
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface session={first} />
        </StrictMode>,
      ),
    );
    await act(async () => {
      current.setDraft('Prefix');
      await current.captureAction();
      transcript.text('spoken words');
    });
    expect(document.body.querySelector('textarea')?.value).toBe('Prefix spoken words');
    const previous = current;
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface session={{}} />
        </StrictMode>,
      ),
    );
    expect(current).not.toBe(previous);
    expect(recordingClosed).toBe(true);
    await act(async () => transcript.text('Late closed speech'));
    expect(document.body.querySelector('textarea')?.value).toBe('');
    expect(current.snapshot().prompts).toEqual([]);

    expect(previous.closed()).toBe(true);
    await act(async () => {
      current.setDraft('New session text');
      await current.captureAction();
      transcript.text('fresh speech');
    });
    expect(document.body.querySelector('textarea')?.value).toBe('New session text fresh speech');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('mounted shared Chat ignores composition option identity changes without a render loop', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options: baseOptions } = await chatFixture();
  await using _db = db;
  let renders = 0;
  function Surface() {
    renders++;
    if (renders > 20) throw new Error('Chat composition entered a render loop');
    const conversation = useConversation({
      ...baseOptions,
      user: 'user',
      agent: 'agent',
      provider: 'fictional',
      selectedModel: '',
      model: () => Promise.reject(new Error('No model expected')),
      tools: () => ({}),
      instructions: '',
      suggestions: async () => [],
    });
    const snapshot = useChat(conversation);
    return (
      <>
        <Text>{snapshot.capture.phase}</Text>
        <Chat conversation={conversation} arg={null} presentation={{ page: true }} />
      </>
    );
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface />));
    await act(async () => root.render(<Surface />));
    expect(document.body.textContent).toContain('idle');
    expect(renders).toBeLessThan(20);
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
