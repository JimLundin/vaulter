// @vitest-environment happy-dom
import { transactionFixture } from '@/vault/transactions/fixtures.test-support.ts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { OpenApplication } from './index.tsx';
import { applicationNodes } from './composition.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import type { NodeCommit, NodeStore } from '@/vault/nodes/store.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';

test('Application composes the shared Questions owner for retained questions and answers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  history.replaceState(null, '', '#/questions/');

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
    return (
      <OpenApplication
        session={{
          ready: true,

          locked: null,
          signOut: null,
          secrets: null,
          preloadedSecrets: null,
          secretOverrides: {},
          updateSecret: async () => undefined,

          nodes: transactionFixture(nodes),
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
      const all = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'All',
      )!;
      all.click();
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

test('Application saves answers in Questions and filters the retained shared collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  history.replaceState(null, '', '#/questions/');

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
    return (
      <OpenApplication
        session={{
          ready: true,

          locked: null,
          signOut: null,
          secrets: null,
          preloadedSecrets: null,
          secretOverrides: {},
          updateSecret: async () => undefined,

          nodes: transactionFixture(nodes),
          nodeStatus: { kind: 'synced', at: 0 },
          refreshNodes: async () => undefined,
        }}
      />
    );
  }
  const button = (name: string, scope: ParentNode = document) => {
    const target = [...scope.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === name || item.textContent === name,
    );
    expect(target).toBeDefined();
    return target!;
  };
  const input = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(() => {
      element.focus();
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
    await saveAnswer('Which wall should hold the bench?', 'Use the garden wall.', true);
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
    expect(document.body.textContent).toContain('Use the garden wall.');
  } finally {
    await act(async () => root.unmount());
    nodes.close();
    document.body.replaceChildren();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

async function answerLifetimeFixture(
  signOut: (() => Promise<void>) | null = null,
  initialNodes?: (nodes: ReturnType<typeof memoryNodeBackend>) => NodeStore | TransactionStore,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  history.replaceState(null, '', '#/questions/');

  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('question-origin', [
      create('user', { kind: 'actor' }),
      create('studio', { kind: 'page', title: 'Garden studio' }),
      create('section', { kind: 'section' }, 'studio'),
      create(
        'question',
        { kind: 'question', text: 'Which wall should hold the bench?' },
        'section',
      ),
    ]),
  );
  let suppliedNodes = initialNodes?.(nodes) ?? nodes;
  const root = createRoot(document.body);
  function Surface() {
    return (
      <OpenApplication
        session={{
          ready: true,
          identity: nodes,

          locked: null,
          signOut,
          secrets: { github: 'fictional-token' },
          preloadedSecrets: { github: 'fictional-token' },
          secretOverrides: {},
          updateSecret: async () => undefined,

          nodes: transactionFixture(suppliedNodes),
          nodeStatus: { kind: 'synced', at: 0 },
          refreshNodes: async () => undefined,
        }}
      />
    );
  }
  await act(async () => root.render(<Surface />));
  const button = (label: string, scope: ParentNode = document) => {
    const element = [...scope.querySelectorAll('button')].find(
      (candidate) =>
        candidate.getAttribute('aria-label') === label || candidate.textContent === label,
    );
    if (!element) throw new Error(`Missing button ${label}`);
    return element;
  };
  const draft = async (text: string) => {
    const element = document.querySelector('textarea')!;
    await act(() => {
      element.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        element,
        text,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const navigate = async (hash: string) => {
    await act(() => {
      history.replaceState(null, '', hash);
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    nodes.close();
    document.body.replaceChildren();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  };
  const replaceNodes = async (next: NodeStore | TransactionStore) => {
    suppliedNodes = next;
    await act(async () => root.render(<Surface />));
  };
  return { nodes, button, draft, navigate, replaceNodes, cleanup };
}

test('credential replacement retains entered Answer permission and moves prewrapped owner reads to the new adapter', async () => {
  let closed = false;
  const attempts: NodeCommit[] = [];
  const fixture = await answerLifetimeFixture(null, (raw) => {
    const checkOpen = () => {
      if (closed) throw new Error('The old credential adapter is closed.');
    };
    const transport: NodeStore = {
      snapshot: (sequence) => {
        checkOpen();
        return raw.snapshot(sequence);
      },
      history: (options) => {
        checkOpen();
        return raw.history(options);
      },
      changes: (transaction) => {
        checkOpen();
        return raw.changes(transaction);
      },
      subscribe: raw.subscribe,
      commit: (value, publication) => {
        checkOpen();
        if (value.kind.scope !== 'questions') return raw.commit(value, publication);
        attempts.push(value);
        // Enter actual authoritative owner admission, then lose publication availability.
        return raw
          .commit(value, (context) => {
            publication?.(context);
            throw new Error('Credential expired during Answer publication.');
          })
          .catch(() => {
            throw new Error('Credential expired during Answer publication.');
          });
      },
    };
    return applicationNodes(transactionFixture(transport));
  });
  const { nodes, button, draft, navigate, replaceNodes } = fixture;
  try {
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(document.querySelector('textarea')?.disabled).toBe(false);
    });
    await draft('Use the garden wall.');
    await act(async () => button('Save answer').click());
    await vi.waitFor(() => expect(document.body.textContent).toContain('Credential expired'));
    const replacement: NodeStore = {
      ...nodes,
      commit: (value, publication) => {
        if (value.kind.scope === 'questions') attempts.push(value);
        return nodes.commit(value, publication);
      },
    };
    closed = true;
    await replaceNodes(replacement);
    await act(async () => button('Retry original answer').click());
    await vi.waitFor(() =>
      expect(document.body.textContent).not.toContain('Retry original answer'),
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
    expect(
      (await nodes.snapshot()).children('question').filter((node) => node.data?.kind === 'answer'),
    ).toHaveLength(1);

    await nodes.commit(
      request('later-question', [
        create('later-question', { kind: 'question', text: 'Which tools should stay?' }),
      ]),
    );
    await navigate('#/questions/');
    await vi.waitFor(() => expect(document.querySelector('textarea')?.disabled).toBe(false));
    await draft('Keep the plane.');
    await act(async () => button('Save answer').click());
    await vi.waitFor(async () =>
      expect(
        (await nodes.snapshot())
          .children('later-question')
          .filter((node) => node.data?.kind === 'answer'),
      ).toHaveLength(1),
    );
    expect(attempts).toHaveLength(3);
  } finally {
    await fixture.cleanup();
  }
});

test('Application retains an admitted answer across Chat navigation and retries its original request in Questions', async () => {
  const fixture = await answerLifetimeFixture();
  const { nodes, button, draft, navigate } = fixture;
  const { commit } = nodes;
  const attempts: NodeCommit[] = [];
  let failPublication!: () => void;
  vi.spyOn(nodes, 'commit').mockImplementation((value, publication) => {
    if (value.kind.scope !== 'questions' || value.kind.action !== 'answer')
      return commit(value, publication);
    attempts.push(value);
    if (attempts.length === 1)
      return new Promise((_, reject) => {
        failPublication = () => reject(new Error('Answer publication unavailable.'));
      });
    return commit(value, publication);
  });
  try {
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(document.querySelector('textarea')?.disabled).toBe(false);
    });
    await draft('Use the garden wall.');
    await act(async () => button('Save answer').click());
    await vi.waitFor(() => expect(attempts).toHaveLength(1));
    await navigate('#/chat/');
    expect(document.body.textContent).not.toContain('Which wall should hold the bench?');
    await act(async () => failPublication());
    await navigate('#/questions/');
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(button('Retry original answer').disabled).toBe(false);
    });
    expect(document.body.textContent).toContain('Use the garden wall.');
    expect(document.body.textContent).toContain('Answer publication unavailable.');
    await act(() => {
      button('Retry original answer').click();
      button('Retry original answer').click();
    });
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(document.body.textContent).not.toContain('Retry original answer');
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
    expect(attempts[1]!.id).toBe(attempts[0]!.id);
    const view = await nodes.snapshot();
    const answers = view.children('question').filter((node) => node.data?.kind === 'answer');
    expect(answers).toHaveLength(1);
    expect(answers[0]!.data).toEqual({ kind: 'answer', text: 'Use the garden wall.' });
    expect(answers[0]!.key.transaction).toBe(attempts[0]!.id);
    await act(async () => button('Answered').click());
    expect(document.body.textContent).toContain('Use the garden wall.');
  } finally {
    await fixture.cleanup();
  }
});

test('Application sign-out closes an admitted Answer before its pending Snapshot can publish', async () => {
  const signOut = vi.fn<() => Promise<void>>();
  signOut.mockResolvedValue();
  const fixture = await answerLifetimeFixture(signOut);
  const { nodes, button, draft } = fixture;
  await vi.waitFor(async () => {
    await act(async () => undefined);
    expect(document.querySelector('textarea')?.disabled).toBe(false);
  });
  const view = await nodes.snapshot();
  let releaseSnapshot!: () => void;
  const snapshot = vi.spyOn(nodes, 'snapshot').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseSnapshot = () => resolve(view);
      }),
  );
  const commit = vi.spyOn(nodes, 'commit');
  try {
    await draft('Use the garden wall.');
    await act(async () => button('Save answer').click());
    expect(snapshot).toHaveBeenCalledTimes(1);
    await act(async () => button('Sign out').click());
    expect(signOut).toHaveBeenCalledTimes(1);
    await act(async () => releaseSnapshot());
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Questions session is closed'),
    );
    expect(commit).not.toHaveBeenCalled();
  } finally {
    await fixture.cleanup();
  }
});
