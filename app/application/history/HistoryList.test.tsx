// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { HistoryList, TransactionItem } from './HistoryList.tsx';
import type { HistoryEntry } from './entries.ts';
import { e, openDatabase, SaveError } from '@/application/store/index.ts';
import { vaultHistory } from './eav.ts';

test('new transactions preserve loaded older pages and every kind remains visible', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const Record = e.entity('unknown.record', { title: e.string() });
  await using db = await openDatabase({ schema: e.registry({ records: Record }) });
  for (let i = 0; i < 31; i++) {
    await db.transaction((tx) => tx.entities.records.insert({ title: `Item ${i}` }));
  }
  const element = document.body;
  const root = createRoot(element);
  const history = vaultHistory({ database: async () => db });
  try {
    await act(async () => root.render(<HistoryList history={history} />));
    expect(element.textContent).not.toContain('Item 0');
    await act(async () => {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent === 'Load earlier')!
        .click();
    });
    expect(element.textContent).toContain('Item 0');
    await act(async () => {
      await db.transaction((tx) => tx.entities.records.insert({ title: 'Remote receipt' }));
    });
    expect(element.textContent).toContain('Remote receipt');
    expect(element.textContent).toContain('Item 0');
    expect(element.textContent).toContain('Item 1');
  } finally {
    await act(async () => root.unmount());
    element.replaceChildren();
    vi.unstubAllGlobals();
  }
});

// The record-view seam accepts a resolved historical projection and explicit actions, without storage.
test('a recorded transaction renders historical attribution and unknown kinds with explicit compensation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const entry: HistoryEntry = {
    key: 'eav:2',
    sequence: 2,
    recordedAt: '2026-10-11T09:00:00Z',
    title: 'Created future content: Retained item',
    author: 'Original author',
    origin: 'Original source',
    details: ['Recorded source evidence'],
  };
  const selected: HistoryEntry[] = [];
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
    expect(host.textContent).not.toContain('Original source');
    const toggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Created future content: Retained item"]',
    )!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Original source');
    expect(host.textContent).toContain('#2');
    expect(host.textContent).toContain('Recorded source evidence');
    const undo = host.querySelector<HTMLButtonElement>('button[aria-label="Undo transaction #2"]');
    expect(undo).not.toBeNull();
    await act(async () => undo!.click());
    expect(selected).toEqual([entry]);
    await act(async () => toggle.click());
    expect(host.textContent).not.toContain('Recorded source evidence');
  } finally {
    await act(async () => root.unmount());
    host.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('expanded transactions retain changes beyond the hundredth record', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const entry: HistoryEntry = {
    key: 'eav:101',
    sequence: 101,
    title: 'Recorded 101 changes',
    recordedAt: '2026-10-11T09:00:00Z',
    details: [],
    changes: Array.from({ length: 101 }, (_, index) => ({
      title: `Changed record ${index}`,
      fields: [],
    })),
  };
  const host = document.body;
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <TransactionItem
          entry={entry}
          expanded={true}
          onExpand={() => undefined}
          canUndo={false}
          onUndo={() => undefined}
        />,
      ),
    );
    expect(host.textContent).toContain('Changed record 100');
  } finally {
    await act(async () => root.unmount());
    host.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('an uncertain compensation save stays reviewable and labels its retry explicitly', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const undo = vi
    .fn()
    .mockRejectedValueOnce(new SaveError(new Error('Offline'), async () => undefined))
    .mockResolvedValueOnce(undefined);
  const entry: HistoryEntry = {
    key: 'eav:1',
    sequence: 1,
    title: 'Updated evidence',
    recordedAt: '2026-10-11T09:00:00Z',
    details: [],
    undo,
  };
  const host = document.body;
  const root = createRoot(host);
  const history = { entries: async () => [entry], subscribe: () => () => undefined };
  try {
    await act(async () => root.render(<HistoryList history={history} />));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Undo transaction #1"]')!.click(),
    );
    const button = (text: string) =>
      [...document.querySelectorAll('button')].find((item) => item.textContent === text)!;
    await act(async () => button('Undo').click());
    expect(document.body.textContent).toContain('Offline');
    expect(button('Retry save')).toBeDefined();
    await act(async () => button('Retry save').click());
    expect(undo).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain('Retry save');
  } finally {
    await act(async () => root.unmount());
    host.replaceChildren();
    vi.unstubAllGlobals();
  }
});
