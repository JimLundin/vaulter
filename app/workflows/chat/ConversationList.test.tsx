// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { ConversationList } from './ConversationList.tsx';
import { createNodeConversation } from './node-conversation.ts';

test('saved conversation loading and read errors remain visible and a later recorded update recovers selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const backend = memoryNodeBackend();
  await seed(backend);
  await backend.commit(
    request('saved-chat', [
      create('chat', {
        kind: 'conversation',
        title: 'Retained studio conversation',
        createdAt: '2026-10-10T12:00:00Z',
      }),
    ]),
  );
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failure = true;
  const nodes: NodeStore = {
    ...backend,
    snapshot: async (sequence) => {
      await pending;
      if (failure) throw new Error('Saved conversation read unavailable');
      return backend.snapshot(sequence);
    },
  };
  const conversation = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'user',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: '',
    model: async () => {
      throw new Error('Reading must not execute');
    },
  });
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
      await backend.commit(
        request('recorded-update', [create('additional-content', { kind: 'content' })]),
      );
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
    backend.close();
    vi.unstubAllGlobals();
  }
});
