// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { OpenProduct } from './product.tsx';
import { liveVault } from './vault/index.ts';
import { useWriter } from './vault/changes/writer.ts';
import { memoryBackend } from './vault/storage/memory.ts';
import { memoryNodeBackend } from './vault/nodes/memory.ts';
import { create, request, revise } from './vault/nodes/fixtures.test-support.ts';

test('Product composes the shared Questions owner for nested Wiki questions and retained answers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  history.replaceState(null, '', '#/wiki/studio/');
  const files = memoryBackend({});
  const head = await files.backend.cached();
  const rules = { problems: async () => [], keeps: () => true, what: 'Fictional files' };
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('studio', { kind: 'page', title: 'Garden studio' }),
      create('section', { kind: 'section' }, 'studio'),
      create('heading', { kind: 'heading' }, 'section'),
      create('heading-text', { kind: 'run', text: 'Planning' }, 'heading'),
      {
        ...create('question', { kind: 'question', text: 'Which wall?' }, 'section'),
        placement: { parent: 'section', order: 'b' },
      },
      create('chat', {
        kind: 'conversation',
        title: 'Workbench planning',
        createdAt: '2026-10-01T08:00:00Z',
      }),
      create('exchange', { kind: 'exchange', startedAt: '2026-10-01T08:00:00Z' }, 'chat'),
      create(
        'answer',
        { kind: 'message', role: 'user', at: '2026-10-01T08:00:00Z', text: 'The garden wall.' },
        'exchange',
      ),
    ]),
  );
  const root = createRoot(document.body);
  function Surface() {
    const writer = useWriter(files.backend, rules, head, () => undefined);
    return (
      <OpenProduct
        session={{
          vault: liveVault(() => writer),
          files: head!.files,
          status: { kind: 'synced', at: 0 },
          locked: null,
          signOut: null,
          secrets: null,
          blocked: null,
          nodes,
          nodeStatus: { kind: 'synced', at: 0 },
          refreshNodes: async () => undefined,
        }}
      />
    );
  }
  try {
    await act(async () => root.render(<Surface />));
    await act(async () => {
      await vi.waitFor(() => expect(document.body.textContent).toContain('Open question'));
    });
    expect(document.body.textContent).toContain('Which wall?');
    await act(async () => {
      await nodes.commit(
        request('answered', [
          {
            ...create(
              'answered-by',
              { kind: 'relationship', predicate: 'answered-by' },
              'exchange',
            ),
            connection: {
              source: { node: 'question' },
              target: { node: 'answer', transaction: 'original' },
            },
          },
        ]),
      );
      await vi.waitFor(() => expect(document.body.textContent).toContain('Recorded answer'));
    });
    expect(document.body.textContent).not.toContain('Open question');
    expect(document.querySelector('a[href="#/chat/chat/"]')?.textContent).toBe(
      'Open source context: Workbench planning',
    );
    await act(async () => {
      await nodes.commit(request('removed-answer', [await revise(nodes, 'answer', null)]));
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('Answer removed; recorded link retained'),
      );
    });
    expect(document.body.textContent).toContain('Answered');
    expect(document.body.textContent).not.toContain('Open question');
  } finally {
    await act(async () => root.unmount());
    nodes.close();
    document.body.replaceChildren();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
