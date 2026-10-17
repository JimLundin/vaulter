// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { ChatBackend, SavedChat } from './backend.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { ConversationList } from './ConversationList.tsx';
import { createConversation } from './conversation.ts';

test('saved conversation loading and read errors remain visible and a later recorded update recovers selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  const chats: SavedChat[] = [
    {
      node: 'chat',
      data: { title: 'Retained studio conversation' },
      activeAt: '2026-10-10T12:00:00Z',
    },
  ];
  const listeners = new Set<() => void>();
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failure = true;
  const backend: ChatBackend = {
    chats: async () => {
      await pending;
      if (failure) throw new Error('Saved conversation read unavailable');
      return chats;
    },
    messages: async () => [],
    send: () => {
      throw new Error('Reading must not execute');
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => listeners.clear(),
  };
  const conversation = createConversation({ ...options, backend: () => backend });
  const host = document.body;
  const root = createRoot(host);
  let closed = false;
  try {
    await act(async () =>
      root.render(
        <ConversationList
          conversation={conversation}
          open={false}
          onClose={() => {
            closed = true;
          }}
        />,
      ),
    );
    expect(host.textContent).toContain('Loading conversations…');
    await act(async () => release());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Saved conversation read unavailable',
    );
    failure = false;
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const row = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Retained studio conversation'),
    );
    expect(row).toBeDefined();
    await act(async () => row!.click());
    expect(conversation.conversation()).toBe('chat');
    expect(closed).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.replaceChildren();
    conversation.dispose();
    vi.unstubAllGlobals();
  }
});

test('the conversation picker loads twenty recent conversations at a time and retries failed pages without selecting one', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { db, options } = await chatFixture();
  await using _db = db;
  const chats: SavedChat[] = Array.from({ length: 65 }, (_, index) => ({
    node: `chat-${String(index).padStart(2, '0')}`,
    data: { title: `chat-${String(index).padStart(2, '0')}` },
    activeAt: new Date(Date.parse('2026-10-10T12:00:00Z') + index * 60_000).toISOString(),
  })).reverse();
  let failure = false;
  const backend: ChatBackend = {
    chats: async (query) => {
      if (failure) throw new Error('Older conversations could not load');
      return chats.slice(0, query?.limit);
    },
    messages: async () => [],
    send: () => {
      throw new Error('Reading must not execute');
    },
    subscribe: () => () => {},
    dispose: () => {},
  };
  const conversation = createConversation({ ...options, backend: () => backend });
  const selected = conversation.conversation();
  const root = createRoot(document.body);
  const rows = () =>
    [...document.querySelectorAll('button')].filter((button) =>
      button.textContent?.includes('chat-'),
    );
  const more = () =>
    [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Load older conversations',
    );
  try {
    await act(async () =>
      root.render(
        <ConversationList conversation={conversation} open={false} onClose={() => undefined} />,
      ),
    );
    expect(rows()).toHaveLength(20);
    expect(rows()[0]?.textContent).toContain('chat-64');
    expect(more()).toBeDefined();
    failure = true;
    await act(async () => more()!.click());
    expect(rows()).toHaveLength(20);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Older conversations could not load',
    );
    failure = false;
    await act(async () => more()!.click());
    expect(rows()).toHaveLength(40);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => more()!.click());
    expect(rows()).toHaveLength(60);
    await act(async () => more()!.click());
    expect(rows()).toHaveLength(65);
    expect(more()).toBeUndefined();
    expect(conversation.conversation()).toBe(selected);
    expect(conversation.snapshot().turns).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
