// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { NodeHistory, TransactionItem } from './NodeHistory.tsx';
import type { NodeHistoryEntry } from './nodes.ts';
import { parseCommit } from '../../nodes/validation.ts';
import { nodeHistory } from './nodes.ts';
import { memoryNodeBackend } from '../../nodes/memory.ts';
import { create, request, seed } from '../../nodes/fixtures.test-support.ts';

test('new transactions preserve loaded older pages and every kind remains visible', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  for (let i = 0; i < 30; i++) {
    await nodes.commit(
      request(`change-${i}`, [create(`node-${i}`, { kind: 'content', title: `Item ${i}` })]),
    );
  }
  const element = document.body;
  const root = createRoot(element);
  const history = {
    entries: (options?: Parameters<typeof nodeHistory>[1]) => nodeHistory(nodes, options),
    subscribe: nodes.subscribe,
  };
  try {
    await act(async () => root.render(<NodeHistory history={history} />));
    expect(element.textContent).not.toContain('seed');
    await act(async () => {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent === 'Load earlier')!
        .click();
    });
    expect(element.textContent).toContain('seed');
    await act(async () => {
      await nodes.commit(
        parseCommit({
          ...request('remote-receipt', [create('tool', { kind: 'toolExecution' })]),
          kind: { scope: 'uninstalled-workflow', action: 'recordReceipt' },
        }),
      );
    });
    expect(element.textContent).toContain('remote-receipt');
    expect(element.textContent).toContain('seed');
    expect(element.textContent).toContain('change-0');
  } finally {
    await act(async () => root.unmount());
    element.replaceChildren();
    nodes.close();
    vi.unstubAllGlobals();
  }
});

// The record-view seam accepts a resolved historical projection and explicit actions, without storage.
test('a recorded transaction renders historical attribution and unknown kinds with explicit compensation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const entry: NodeHistoryEntry = {
    transaction: {
      id: 'import-2',
      sequence: 2,
      recordedAt: '2026-10-11T09:00:00Z',
      recordedBy: 'author',
      origin: 'source',
      kind: parseCommit({
        ...request('unknown', [create('unknown-item', { kind: 'content' })]),
        kind: { scope: 'future', action: 'import' },
      }).kind,
      message: null,
      undoOf: null,
    },
    author: {
      key: { node: 'author', transaction: 'import-2' },
      data: { kind: 'actor', name: 'Original author' },
      placement: null,
      connection: null,
    },
    origin: {
      key: { node: 'source', transaction: 'import-2' },
      data: { kind: 'context', title: 'Original source' },
      placement: null,
      connection: null,
    },
    differences: [
      {
        node: 'item',
        before: null,
        after: {
          key: { node: 'item', transaction: 'import-2' },
          data: { kind: 'future-content', title: 'Retained item' },
          placement: null,
          connection: null,
        },
      },
    ],
  };
  const selected: NodeHistoryEntry[] = [];
  function Example() {
    const [expanded, setExpanded] = useState(false);
    return (
      <TransactionItem
        entry={entry}
        expanded={expanded}
        onExpand={() => setExpanded(!expanded)}
        canUndo={true}
        onUndo={() => selected.push(entry)}
      />
    );
  }
  const host = document.body;
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Example />));
    expect(host.textContent).toContain('Original author');
    expect(host.textContent).toContain('#2');
    expect(host.textContent).not.toContain('Original source');
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="future.import"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('From Original source');
    expect(host.textContent).toContain('Created future-content: Retained item');
    const undo = host.querySelector<HTMLButtonElement>('button[aria-label="Undo transaction #2"]');
    expect(undo).not.toBeNull();
    await act(async () => undo!.click());
    expect(selected).toEqual([entry]);
    await act(async () => toggle.click());
    expect(host.textContent).not.toContain('Retained item');
  } finally {
    await act(async () => root.unmount());
    host.replaceChildren();
    vi.unstubAllGlobals();
  }
});
