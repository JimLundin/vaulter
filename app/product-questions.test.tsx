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
          preloadedSecrets: null,
          secretOverrides: {},
          updateSecret: async () => undefined,
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
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-slot=card][aria-label="Open question"]'),
        ).not.toBeNull(),
      );
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
    expect(document.querySelector('a[href="#/chat/chat/"]')?.getAttribute('aria-label')).toBe(
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

test('Product saves answers from Wiki and Questions and filters the retained shared collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  history.replaceState(null, '', '#/wiki/studio/');
  const files = memoryBackend({});
  const head = await files.backend.cached();
  const rules = { problems: async () => [], keeps: () => true, what: 'Fictional files' };
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('questions', [
      create('user', { kind: 'actor' }),
      create('studio', { kind: 'page', title: 'Garden studio' }),
      create('section', { kind: 'section' }, 'studio'),
      create(
        'wiki-question',
        { kind: 'question', text: 'Which wall should hold the bench?' },
        'section',
      ),
      {
        ...create(
          'module-question',
          { kind: 'question', text: 'Which tools should stay?' },
          'studio',
        ),
        placement: { parent: 'studio', order: 'b' },
      },
      {
        ...create(
          'abandoned-question',
          { kind: 'question', text: 'Should we add a skylight?', abandoned: true },
          'studio',
        ),
        placement: { parent: 'studio', order: 'c' },
      },
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
          preloadedSecrets: null,
          secretOverrides: {},
          updateSecret: async () => undefined,
          blocked: null,
          nodes,
          nodeStatus: { kind: 'synced', at: 0 },
          refreshNodes: async () => undefined,
        }}
      />
    );
  }
  const button = (name: string, scope: ParentNode = document) => {
    const target = [...scope.querySelectorAll('button')].find((item) => item.textContent === name);
    expect(target).toBeDefined();
    return target!;
  };
  const input = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(() => {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const navigate = async (hash: string) => {
    await act(() => {
      history.replaceState(null, '', hash);
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  };
  const saveAnswer = async (text: string, answer: string, leavesOpenList = false) => {
    const section = [
      ...document.querySelectorAll<HTMLElement>('[data-slot=card][aria-label="Open question"]'),
    ].find((item) => item.textContent?.includes(text));
    expect(section).toBeDefined();
    await vi.waitFor(async () => {
      // Flush each readiness update without holding it inside the polling act scope.
      await act(async () => undefined);
      expect(section!.querySelector('textarea')?.disabled).toBe(false);
    });
    const textarea = section!.querySelector('textarea');
    expect(textarea).not.toBeNull();
    await input(textarea!, answer);
    await act(async () => button('Save answer', section!).click());
    await act(async () => {
      await vi.waitFor(() => {
        if (leavesOpenList) expect(document.body.textContent).not.toContain(text);
        else expect(section!.getAttribute('aria-label')).toBe('Answered');
      });
    });
    if (!leavesOpenList) expect(section!.textContent).toContain(answer);
  };
  try {
    await act(async () => root.render(<Surface />));
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('Which wall should hold the bench?'),
      );
    });
    await saveAnswer('Which wall should hold the bench?', 'Use the garden wall.');
    await navigate('#/questions/');
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('Which tools should stay?'),
      );
    });
    expect(document.body.textContent).not.toContain('Which wall should hold the bench?');
    expect(document.body.textContent).not.toContain('Should we add a skylight?');
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Find questions"]')!;
    expect(search).not.toBeNull();
    await input(search, 'skylight');
    expect(document.body.textContent).not.toContain('Which tools should stay?');
    await act(async () => button('Abandoned').click());
    expect(document.body.textContent).toContain('Should we add a skylight?');
    await input(search, '');
    await act(async () => button('Answered').click());
    expect(document.body.textContent).toContain('Use the garden wall.');
    expect(document.body.textContent).not.toContain('Which tools should stay?');
    await act(async () => button('Open').click());
    await saveAnswer('Which tools should stay?', 'Keep the chisels and hand plane.', true);
    await act(async () => button('All').click());
    expect(document.body.textContent).toContain('Use the garden wall.');
    expect(document.body.textContent).toContain('Keep the chisels and hand plane.');
    const view = await nodes.snapshot();
    const relationship = view
      .children('module-question')
      .find(({ data }) => data?.predicate === 'answered-by')!;
    const moduleAnswer = view.resolve(relationship.connection!.target)!;
    expect(relationship.connection!.target.transaction).toBe(moduleAnswer.key.transaction);
    expect(moduleAnswer.data).toEqual({ kind: 'answer', text: 'Keep the chisels and hand plane.' });
    const answerTransaction = (await nodes.history()).find(
      ({ id }) => id === moduleAnswer.key.transaction,
    )!;
    expect(answerTransaction.recordedBy).toBe('vaulter:owner');
    const changes = await Promise.all((await nodes.history()).map(({ id }) => nodes.changes(id)));
    expect(
      [
        ...new Set(
          changes
            .flat()
            .filter(({ after }) => after.data?.kind === 'question')
            .map(({ node }) => node),
        ),
      ].sort(),
    ).toEqual(['abandoned-question', 'module-question', 'wiki-question']);
    await navigate('#/wiki/studio/');
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('Keep the chisels and hand plane.'),
      );
    });
    expect(document.body.textContent).toContain('Use the garden wall.');
  } finally {
    await act(async () => root.unmount());
    nodes.close();
    document.body.replaceChildren();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
