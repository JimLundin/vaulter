import { unrelatedContent } from './related-content.test-support.ts';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import type { NodeSnapshot, NodeStore } from '@/vault/nodes/store.ts';
import type { SourceReader } from '@/vault/sources.ts';
import { createWikiReading } from './reading.ts';

const sources: SourceReader = { text: () => undefined, describe: () => undefined };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const install = (nodes: NodeStore) =>
  nodes.commit(
    request('initial', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Original page' }),
    ]),
  );

test('Wiki owns initial failures, accepted updates and recovery while retaining previously read pages', async () => {
  const backend = memoryNodeBackend();
  await install(backend);
  let failure: Error | undefined = new Error('Opening failed');
  const unsubscribe = vi.fn();
  const nodes: NodeStore = {
    ...backend,
    snapshot: (sequence) => (failure ? Promise.reject(failure) : backend.snapshot(sequence)),
    subscribe: (listener) => {
      const release = backend.subscribe(listener);
      return () => {
        unsubscribe();
        release();
      };
    },
  };
  const reading = createWikiReading(nodes, sources, unrelatedContent);
  expect(reading.snapshot()).toEqual({ pages: null, loading: true });
  reading.start();
  try {
    await vi.waitFor(() => expect(reading.snapshot().error).toBe('Opening failed'));
    expect(reading.snapshot().pages).toBeNull();
    failure = undefined;
    await reading.reload();
    expect(reading.snapshot()).toMatchObject({
      loading: false,
      pages: [{ id: 'page', title: 'Original page' }],
    });
    failure = new Error('Refresh failed');
    await reading.reload();
    expect(reading.snapshot()).toMatchObject({
      error: 'Refresh failed',
      pages: [{ title: 'Original page' }],
    });
    failure = undefined;
    await backend.commit(
      request('rename', [await revise(backend, 'page', { kind: 'page', title: 'Updated page' })]),
    );
    await vi.waitFor(() => expect(reading.snapshot().pages?.[0].title).toBe('Updated page'));
    expect(reading.snapshot().error).toBeUndefined();
  } finally {
    reading.dispose();
    backend.close();
  }
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test('an older Wiki read cannot replace a newer result or publish its late failure', async () => {
  const backend = memoryNodeBackend();
  await install(backend);
  const original = await backend.snapshot();
  await backend.commit(
    request('rename', [await revise(backend, 'page', { kind: 'page', title: 'Updated page' })]),
  );
  const updated = await backend.snapshot();
  const first = deferred<NodeSnapshot>();
  const second = deferred<NodeSnapshot>();
  const third = deferred<NodeSnapshot>();
  const pending = [first, second, third];
  const nodes: NodeStore = {
    ...backend,
    snapshot: (sequence) =>
      sequence === undefined ? pending.shift()!.promise : backend.snapshot(sequence),
  };
  const reading = createWikiReading(nodes, sources, unrelatedContent);
  try {
    const older = reading.reload();
    const newer = reading.reload();
    second.resolve(updated);
    await newer;
    first.resolve(original);
    await older;
    expect(reading.snapshot().pages?.[0].title).toBe('Updated page');
    const failing = reading.reload();
    // A subsequent successful read supersedes the pending failure.
    const replacement = deferred<NodeSnapshot>();
    pending.push(replacement);
    replacement.resolve(updated);
    await reading.reload();
    third.reject(new Error('Late failure'));
    await failing;
    expect(reading.snapshot()).toMatchObject({
      loading: false,
      pages: [{ title: 'Updated page' }],
    });
    expect(reading.snapshot().error).toBeUndefined();
  } finally {
    reading.dispose();
    backend.close();
  }
});

test('Wiki disposal cancels publication, releases its subscription and cannot be restarted', async () => {
  const backend = memoryNodeBackend();
  await install(backend);
  const view = await backend.snapshot();
  const pending = deferred<NodeSnapshot>();
  const snapshot = vi.fn(() => pending.promise);
  const release = vi.fn();
  const subscribe = vi.fn(() => release);
  const reading = createWikiReading({ ...backend, snapshot, subscribe }, sources, unrelatedContent);
  const listener = vi.fn();
  reading.subscribe(listener);
  reading.start();
  const outstanding = reading.reload();
  const before = reading.snapshot();
  reading.dispose();
  pending.resolve(view);
  await outstanding;
  await reading.reload();
  reading.start();
  reading.dispose();
  expect(reading.closed()).toBe(true);
  expect(reading.snapshot()).toBe(before);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(snapshot).toHaveBeenCalledTimes(2);
  expect(subscribe).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  backend.close();
});
