import { unrelatedContent } from './related-content.test-support.ts';
// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { Text } from '@/ui/kit/index.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request } from '@/vault/nodes/fixtures.test-support.ts';
import type { NodeStore } from '@/vault/nodes/store.ts';
import type { SourceReader } from '@/vault/sources.ts';
import type { WikiReading } from './reading.ts';
import { useWikiReading, useWiki } from './use-wiki.ts';

const source = (title: string): SourceReader => ({
  text: (node) => (node.data?.kind === 'resource' ? 'Retained text' : undefined),
  describe: (node) => (node.data?.kind === 'resource' ? { title } : undefined),
});
const install = (nodes: NodeStore, title: string) =>
  nodes.commit(
    request('initial', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title }),
      create('source', { kind: 'resource', url: 'https://example.invalid/source' }),
      {
        ...create('citation', { kind: 'cite', scope: 'page', sequence: 1 }, 'page'),
        connection: {
          source: { node: 'page' },
          target: { node: 'source', transaction: 'initial' },
        },
      },
    ]),
  );

test('Wiki effect replay owns a fresh reader and source/store replacement releases the prior scope', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const first = memoryNodeBackend();
  const second = memoryNodeBackend();
  await install(first, 'First page');
  await install(second, 'Second page');
  let subscriptions = 0;
  const tracked = (nodes: NodeStore): NodeStore => ({
    ...nodes,
    subscribe: (listener) => {
      subscriptions++;
      const unsubscribe = nodes.subscribe(listener);
      return () => {
        subscriptions--;
        unsubscribe();
      };
    },
  });
  const firstStore = tracked(first);
  const secondStore = tracked(second);
  const originalSources = source('Original source');
  const replacementSources = source('Replacement source');
  const owners = new Set<WikiReading>();
  let selected!: WikiReading;
  function Surface({ nodes, sources }: { nodes: NodeStore; sources: SourceReader }) {
    selected = useWikiReading(nodes, sources, unrelatedContent);
    owners.add(selected);
    const state = useWiki(selected);
    return (
      <Text>
        {state.pages?.map((page) => `${page.title}: ${page.sources[0]?.title}`).join(',')}
      </Text>
    );
  }
  const root = createRoot(document.body);
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface nodes={firstStore} sources={originalSources} />
        </StrictMode>,
      ),
    );
    expect(document.body.textContent).toBe('First page: Original source');
    expect(subscriptions).toBe(1);
    expect([...owners].filter((owner) => owner.closed())).not.toHaveLength(0);
    expect(selected.closed()).toBe(false);
    const original = selected;
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface nodes={firstStore} sources={replacementSources} />
        </StrictMode>,
      ),
    );
    expect(document.body.textContent).toBe('First page: Replacement source');
    expect(original.closed()).toBe(true);
    expect(subscriptions).toBe(1);
    const replaced = selected;
    await act(async () =>
      root.render(
        <StrictMode>
          <Surface nodes={secondStore} sources={replacementSources} />
        </StrictMode>,
      ),
    );
    expect(document.body.textContent).toBe('Second page: Replacement source');
    expect(replaced.closed()).toBe(true);
    expect(subscriptions).toBe(1);
  } finally {
    await act(async () => root.unmount());
    first.close();
    second.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
  expect(subscriptions).toBe(0);
  expect(selected.closed()).toBe(true);
});

test('replacing a pending Wiki store never exposes that store’s late collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const first = memoryNodeBackend();
  const second = memoryNodeBackend();
  await install(first, 'Old page');
  await install(second, 'Current page');
  const original = await first.snapshot();
  let release!: (view: typeof original) => void;
  const pending = new Promise<typeof original>((resolve) => {
    release = resolve;
  });
  const opening: NodeStore = {
    ...first,
    snapshot: (sequence) => (sequence === undefined ? pending : first.snapshot(sequence)),
  };
  const sources = source('Source');
  function Surface({ nodes }: { nodes: NodeStore | null }) {
    const state = useWiki(useWikiReading(nodes, sources, unrelatedContent));
    return <Text>{state.pages?.[0]?.title ?? 'Loading'}</Text>;
  }
  const root = createRoot(document.body);
  try {
    await act(async () => root.render(<Surface nodes={opening} />));
    expect(document.body.textContent).toBe('Loading');
    await act(async () => root.render(<Surface nodes={second} />));
    expect(document.body.textContent).toBe('Current page');
    await act(async () => release(original));
    expect(document.body.textContent).toBe('Current page');
    await act(async () => root.render(<Surface nodes={null} />));
    expect(document.body.textContent).toBe('Loading');
  } finally {
    await act(async () => root.unmount());
    first.close();
    second.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
