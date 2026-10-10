// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useSession, type Session } from './session.ts';
import { memoryBackend } from '../storage/memory.ts';
import { memoryNodeBackend } from '../nodes/memory.ts';
import type { NodeBackend } from '../nodes/store.ts';
import { newCacheKey } from './crypto.ts';
import { remembered, forget } from './unlock.ts';

vi.mock('./unlock.ts', () => ({
  remembered: vi.fn(),
  forget: vi.fn(),
  devUnlocked: vi.fn(),
  unlock: vi.fn(),
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
    await Promise.resolve();
  });
  roots.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function open(nodes: NodeBackend) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  const key = await newCacheKey();
  vi.mocked(remembered).mockResolvedValue({
    secrets: { github: 'fictional-token' },
    cacheKey: key,
  });
  const factory = vi.fn(() => nodes);
  let session!: Session;
  function Probe() {
    session = useSession(
      () => memoryBackend({}).backend,
      () => true,
      factory,
    );
    return null;
  }
  const root = createRoot(document.body);
  roots.push(root);
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  return { session: () => session, factory, key, root };
}

test('unlocked session injects credentials/key, loads cache before remote refresh, and closes on unmount', async () => {
  const nodes = memoryNodeBackend();
  const order: string[] = [];
  vi.spyOn(nodes, 'cached').mockImplementation(() => {
    order.push('cached');
    return Promise.resolve();
  });
  vi.spyOn(nodes, 'refresh').mockImplementation(() => {
    order.push('refresh');
    return Promise.resolve();
  });
  const close = vi.spyOn(nodes, 'close');
  const { session, factory, key, root } = await open(nodes);
  expect(factory).toHaveBeenCalledWith({ secrets: { github: 'fictional-token' }, key });
  expect(order).toEqual(['cached', 'refresh']);
  expect(session().nodes).toBe(nodes);
  expect(session().nodeStatus.kind).toBe('synced');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  expect(close).toHaveBeenCalled();
});

test('node persistence failure stays separate from the legacy file session', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'refresh').mockRejectedValue(new Error('GitHub unavailable'));
  const { session } = await open(nodes);
  expect(session().status.kind).toBe('synced');
  expect(session().nodeStatus.kind).toBe('error');
  expect(session().head).not.toBeNull();
});

test('sign out clears the node cache and closes it before forgetting credentials', async () => {
  const nodes = memoryNodeBackend();
  const order: string[] = [];
  vi.spyOn(nodes, 'clear').mockImplementation(() => {
    order.push('clear');
    return Promise.resolve();
  });
  vi.spyOn(nodes, 'close').mockImplementation(() => {
    order.push('close');
  });
  vi.mocked(forget).mockImplementation(() => {
    order.push('forget');
    return Promise.resolve();
  });
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  const { session } = await open(nodes);
  await act(async () => {
    await session().signOut!();
  });
  expect(order).toEqual(['clear', 'close', 'forget']);
});
