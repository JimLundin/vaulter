// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { ChatMessage } from './ChatMessage.tsx';
import type { Turn } from './view.ts';

test('retained summary renders Markdown with explicit record attribution', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  try {
    await act(async () =>
      root.render(
        <ChatMessage
          live={true}
          turn={{
            role: 'record',
            at: '2026-06-05T00:00:00+02:00',
            record: { kind: 'summary', label: 'Daily summary' },
            parts: [{ kind: 'text', text: 'Kept **studio time** free.' }],
          }}
        />,
      ),
    );
    expect(document.body.textContent).toContain('Daily summary');
    expect(document.body.querySelector('[data-message="record"] strong')?.textContent).toBe(
      'studio time',
    );
    expect(document.body.querySelector('[data-message="agent"]')).toBeNull();
    expect(document.body.querySelector('[data-message="user"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Thinking…');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

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
        input: { title: 'Walks' },
        output: { node: 'thought-1' },
        status: 'complete',
      },
    ],
  };
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<ChatMessage turn={turn} />));
    expect(document.body.textContent).toContain('The accepted thought is retained.');
    expect(document.body.textContent).toContain('Accepted');
    expect(document.body.textContent).toContain('without resuming execution');
    expect(document.body.textContent).toContain('fictional-model · 123 in · 45 out');
    expect(document.body.textContent).not.toContain('Thinking…');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
