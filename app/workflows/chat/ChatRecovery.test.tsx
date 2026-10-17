// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { createConversation } from './conversation.ts';
import type { ChatBackend, ChatRunState } from './backend.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { Chat } from './Chat.tsx';

test('both visible Chat surfaces observe the same response-save progress', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const listeners = new Set<() => void>();
  let state: ChatRunState = {
    phase: 'unsaved',
    response: {
      kind: 'message',
      role: 'agent',
      at: '2026-10-10T12:00:00Z',
      status: 'complete',
      parts: [{ kind: 'text', text: 'Retained answer.' }],
    },
    persistenceError: 'Response unavailable',
    persistenceStage: 'response',
    recovery: {
      save: {
        stage: 'response',
        error: 'Response unavailable',
        label: 'Response needs saving',
        allowed: true,
        inProgress: false,
      },
    },
  };
  const retry = async () => {
    state = {
      ...state,
      recovery: {
        save: {
          stage: 'response',
          error: 'Response unavailable',
          label: 'Response needs saving',
          allowed: false,
          inProgress: true,
        },
      },
    };
    for (const listener of listeners) listener();
    await waiting;
    state = { phase: 'complete', response: state.response };
    for (const listener of listeners) listener();
    return state;
  };
  const backend: ChatBackend = {
    chats: async () => [],
    messages: async () => [{ data: state.response }],
    subscribe: () => () => {},
    dispose: () => listeners.clear(),
    send: () => ({
      snapshot: () => state,
      prepared: () => true,
      done: Promise.resolve(state),
      stop: () => {},
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      retrySave: retry,
      retryContentSave: async () => state,
      refreshContext: async () => state,
    }),
  };
  const conversation = createConversation({ ...options, backend: () => backend });
  const root = createRoot(document.body);
  const recoveryButtons = () =>
    [...document.querySelectorAll('button')].filter((button) =>
      ['Retry save', 'Saving…'].includes(button.textContent ?? ''),
    );
  try {
    await act(async () => {
      const submitted = conversation.prepareSubmission({ text: 'Retain this' });
      if (submitted.status !== 'owned') throw new Error('Expected retained request');
      await submitted.done;
      root.render(
        <>
          <Chat conversation={conversation} arg={null} presentation={{ page: true }} />
          <Chat
            conversation={conversation}
            arg={null}
            presentation={{ open: true, onClose: () => undefined }}
          />
        </>,
      );
    });
    expect(recoveryButtons()).toHaveLength(2);
    await act(async () => {
      recoveryButtons()[0]!.click();
    });
    expect(recoveryButtons().map((button) => button.disabled)).toEqual([true, true]);
    expect(recoveryButtons().map((button) => button.textContent)).toEqual(['Saving…', 'Saving…']);
    await act(async () => {
      release();
      await conversation.retrySave();
    });
    expect(recoveryButtons()).toHaveLength(0);
    expect(document.body.textContent).toContain('Retained answer.');
  } finally {
    release();
    await act(async () => root.unmount());
    conversation.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
