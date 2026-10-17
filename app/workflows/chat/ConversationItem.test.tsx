// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { ConversationItem } from './ConversationList.tsx';
import type { SavedChat } from './backend.ts';

test('a saved conversation keeps its identity in its explicit selection action', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const chat: SavedChat = {
    node: 'conversation-walks',
    data: { title: 'Room for walks' },
    activeAt: '2026-10-11T09:05:00Z',
  };
  const opened: string[] = [];
  const root = createRoot(document.body);
  try {
    await act(async () =>
      root.render(
        <ConversationItem
          chat={chat}
          selected={true}
          disabled={false}
          onOpen={(node) => {
            opened.push(node);
          }}
        />,
      ),
    );
    const button = document.querySelector('button')!;
    expect(button.textContent).toContain('Room for walks');
    expect(button.getAttribute('aria-current')).toBe('true');
    await act(async () => button.click());
    expect(opened).toEqual(['conversation-walks']);
    await act(async () =>
      root.render(
        <ConversationItem
          chat={chat}
          selected={false}
          disabled={true}
          onOpen={(node) => {
            opened.push(node);
          }}
        />,
      ),
    );
    await act(async () => button.click());
    expect(opened).toEqual(['conversation-walks']);
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
