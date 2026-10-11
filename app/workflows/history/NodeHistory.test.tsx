// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { NodeHistory } from './NodeHistory.tsx';
import { nodeHistory } from './nodes.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';

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
      await nodes.commit(request('remote-receipt', [create('tool', { kind: 'toolExecution' })]));
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
