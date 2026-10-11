// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { ChatMessage } from './ChatMessage.tsx';
import type { Turn } from './view.ts';

test('accepted Agent activity renders its receipt, uncertainty and cost without execution', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const turn: Turn = {
    role: 'agent',
    at: '2026-10-11T09:00:00Z',
    status: 'unknown',
    model: 'fictional-model',
    tokens: { in: 123, out: 45 },
    parts: [
      { kind: 'text', text: 'The accepted thought is **retained**.' },
      {
        kind: 'tool',
        name: 'save',
        input: 'a thought',
        args: { title: 'Walks' },
        output: { node: 'thought-1' },
        result: 'Accepted receipt',
      },
    ],
  };
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<ChatMessage turn={turn} />));
    expect(document.body.textContent).toContain('The accepted thought is retained.');
    expect(document.body.textContent).toContain('Accepted receipt');
    expect(document.body.textContent).toContain('without resuming execution');
    expect(document.body.textContent).toContain('fictional-model · 123 in · 45 out');
    expect(document.body.textContent).not.toContain('Thinking…');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
