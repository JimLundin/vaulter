// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { Text } from '../../ui/kit/index.ts';
import { createNodeConversation } from './node-conversation.ts';
import { createTranscription, useTranscription } from './transcription.ts';
import { Chat } from './Chat.tsx';
import { ChatIndicator } from './index.tsx';
import { useNodeConversation, useNodeChat } from './use-node-conversation.ts';

test.each([undefined, 'missing-retained-chat', 'saved-chat'])(
  'a fresh chat page stays empty and error-free with retained selection %s',
  async (retainedConversation) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    if (retainedConversation)
      localStorage.setItem(
        'vaulter:conversation:https://api.github.com:JimLundin/vault@main',
        retainedConversation,
      );
    const nodes = memoryNodeBackend();
    await seed(nodes);
    await nodes.commit(
      request('saved', [
        create('saved-chat', {
          kind: 'conversation',
          title: 'Saved',
          createdAt: '2026-10-10T12:00:00Z',
        }),
        create(
          'saved-exchange',
          { kind: 'exchange', startedAt: '2026-10-10T12:00:00Z' },
          'saved-chat',
        ),
        create(
          'saved-message',
          {
            kind: 'message',
            role: 'user',
            at: '2026-10-10T12:00:00Z',
            text: 'Earlier conversation',
          },
          'saved-exchange',
        ),
      ]),
    );
    const model = vi.fn(async () => {
      throw new Error('Reading must not execute');
    });
    function Surface() {
      const conversation = useNodeConversation({
        nodes,
        user: 'user',
        agent: 'user',
        provider: 'fictional',
        selectedModel: '',
        instructions: '',
        model,
        suggestions: async () => [],
      });
      return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
    }
    const root = createRoot(document.body);
    try {
      await act(async () => root.render(<Surface />));
      expect(
        [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent),
      ).toEqual([]);
      expect(document.body.textContent).not.toContain('Earlier conversation');
      expect(document.querySelector('[data-message]')).toBeNull();
      expect(model).not.toHaveBeenCalled();
      expect(await nodes.history()).toHaveLength(2);
    } finally {
      await act(async () => root.unmount());
      nodes.close();
      localStorage.clear();
      document.body.replaceChildren();
      vi.unstubAllGlobals();
    }
  },
);

test('requested history retries a failed read when store readiness changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('saved', [
      create('saved-chat', {
        kind: 'conversation',
        title: 'Saved',
        createdAt: '2026-10-10T12:00:00Z',
      }),
      create(
        'saved-exchange',
        { kind: 'exchange', startedAt: '2026-10-10T12:00:00Z' },
        'saved-chat',
      ),
      create(
        'saved-message',
        {
          kind: 'message',
          role: 'user',
          at: '2026-10-10T12:00:00Z',
          text: 'Retained history is readable',
        },
        'saved-exchange',
      ),
    ]),
  );
  let unavailable = true;
  const nodes: NodeStore = {
    ...store,
    snapshot: (sequence) =>
      unavailable ? Promise.reject(new Error('Store is opening')) : store.snapshot(sequence),
  };
  const options = {
    nodes,
    user: 'user',
    agent: 'user',
    provider: 'fictional',
    selectedModel: '',
    instructions: '',
    conversation: 'saved-chat',
    model: () => Promise.reject(new Error('Reading must not execute')),
  };
  function Surface({
    availability,
    route = 'saved-chat',
  }: {
    availability: string;
    route?: string;
  }) {
    const conversation = useNodeConversation({
      ...options,
      availability,
      conversation: route || undefined,
    });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface availability="Opening the node store…" />));
    expect(document.body.textContent).toContain('Store is opening');
    unavailable = false;
    await act(async () =>
      root.render(<Surface availability="Configure a model before sending." />),
    );
    expect(document.body.textContent).toContain('Retained history is readable');
    expect(document.body.textContent).not.toContain('Store is opening');
  } finally {
    await act(async () => root.unmount());
    store.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('requested history waits for the initial node read without showing a false unavailable error', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('saved', [
      create('saved-chat', {
        kind: 'conversation',
        title: 'Saved',
        createdAt: '2026-10-10T12:00:00Z',
      }),
      create(
        'saved-exchange',
        { kind: 'exchange', startedAt: '2026-10-10T12:00:00Z' },
        'saved-chat',
      ),
      create(
        'saved-message',
        { kind: 'message', role: 'user', at: '2026-10-10T12:00:00Z', text: 'Ready history' },
        'saved-exchange',
      ),
    ]),
  );
  let ready = false;
  const snapshot = vi.fn<NodeStore['snapshot']>((sequence) =>
    ready ? store.snapshot(sequence) : Promise.reject(new Error('Conversation is unavailable')),
  );
  const nodes: NodeStore = { ...store, snapshot };
  function Surface({ recordsReady }: { recordsReady: boolean }) {
    const conversation = useNodeConversation({
      nodes,
      user: 'user',
      agent: 'user',
      provider: 'fictional',
      selectedModel: '',
      instructions: '',
      conversation: 'saved-chat',
      recordsReady,
      suggestions: async () => [],
      model: () => Promise.reject(new Error('Reading must not execute')),
    });
    return <Chat conversation={conversation} arg={null} presentation={{ page: true }} />;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface recordsReady={false} />));
    expect(snapshot).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    ready = true;
    await act(async () => root.render(<Surface recordsReady={true} />));
    expect(document.body.textContent).toContain('Ready history');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    store.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('a reply finishing with the mounted pane closed remains unread until it reopens', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
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
  const conversation = createNodeConversation({
    nodes,
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
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('retained prompts are consumed once across page and panel views, including edit-only drafts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
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
  const conversation = createNodeConversation({
    nodes,
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
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('changed supplied availability reaches mounted Chat without notifying subscribers during React render', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  const options = {
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Must not execute')),
    suggestions: async () => [],
  };
  function Surface({ availability }: { availability?: string }) {
    const conversation = useNodeConversation({ ...options, availability });
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
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('retained review is presented once across simultaneous views and survives hiding all Chat views', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  const conversation = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: () => Promise.reject(new Error('Must not execute')),
    suggestions: async () => [],
    stagedChanges: () => [{ path: 'Pending.md', before: 'before', text: 'after' }],
  });
  const root = createRoot(document.body);
  const render = (page: boolean, pane: boolean) =>
    root.render(
      <>
        {page && <Chat conversation={conversation} arg={null} presentation={{ page: true }} />}
        <Chat
          conversation={conversation}
          arg={null}
          presentation={{ open: pane, onClose: () => undefined }}
        />
      </>,
    );
  try {
    await act(async () => {
      render(true, true);
      conversation.setDraft('Retained review text');
      conversation.prepareSubmission();
    });
    expect(document.querySelectorAll('[role="dialog"][aria-labelledby]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Retained review text');
    await act(async () => render(false, false));
    expect(conversation.snapshot().review?.intent.text).toBe('Retained review text');
    await act(async () => render(false, true));
    expect(document.body.textContent).toContain('Pending.md');
    await act(async () => {
      const cancel = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'Cancel',
      );
      cancel!.click();
    });
    expect(conversation.snapshot().review).toBeUndefined();
    expect(conversation.snapshot().draft).toBe('Retained review text');
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('simultaneous and reopened Chat views retain blocked Ask with visible Use and Dismiss actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  const voice = createTranscription(async () => ({ finish: async () => 'Spoken', close() {} }));
  const conversation = createNodeConversation({
    nodes,
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
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('StrictMode owns fresh Chat and recording lifetimes and replacing the Vault session retains no old task', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  let transcript!: import('./transcription.ts').TranscriptionEvents;
  let recordingClosed = false;
  const provider: import('./transcription.ts').TranscriptionProvider = async (events) => {
    transcript = events;
    return {
      close: () => {
        recordingClosed = true;
      },
      finish: async () => 'Final speech',
    };
  };
  let current!: ReturnType<typeof useNodeConversation>;
  function Surface({ session }: { session: object }) {
    const voice = useTranscription(provider, session);
    const conversation = useNodeConversation({
      session,
      nodes,
      user: 'user',
      agent: 'user',
      provider: 'fictional',
      selectedModel: '',
      model: () => Promise.reject(new Error('Reading must not execute')),
      instructions: '',
      transcription: voice,
      suggestions: async () => [],
      stagedChanges: () => [{ path: 'Pending.md', before: 'before', text: 'after' }],
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
    expect(current.snapshot().review).toBeUndefined();
    expect(previous.closed()).toBe(true);
    await act(async () => {
      current.setDraft('New session text');
      await current.captureAction();
      transcript.text('fresh speech');
    });
    expect(document.body.querySelector('textarea')?.value).toBe('New session text fresh speech');
  } finally {
    await act(async () => root.unmount());
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('mounted shared Chat ignores composition option identity changes without a render loop', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  let renders = 0;
  function Surface() {
    renders++;
    if (renders > 20) throw new Error('Chat composition entered a render loop');
    const conversation = useNodeConversation({
      nodes,
      user: 'user',
      agent: 'user',
      provider: 'fictional',
      selectedModel: '',
      model: () => Promise.reject(new Error('No model expected')),
      tools: () => ({}),
      instructions: '',
      suggestions: async () => [],
    });
    const snapshot = useNodeChat(conversation);
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
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
