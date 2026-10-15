import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { createGraphExplorer, projectGraphExplorer, type GraphDescription } from './explorer.ts';

const describe: GraphDescription = (node) => ({
  title: String(node.data?.title ?? 'Recorded subject'),
  href: '#/source/',
});
const install = async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('a', { kind: 'content', title: 'Studio' }),
      create('b', { kind: 'content', title: 'Mornings' }),
      create('other', { kind: 'content', title: 'Unrelated' }),
      create('term', { kind: 'term', scheme: 'tag', key: 'work', label: 'Creative work' }),
      {
        ...create('edge', { kind: 'relationship', predicate: 'related-to' }, 'a'),
        connection: { source: { node: 'a' }, target: { node: 'b' } },
      },
    ]),
  );
  return nodes;
};

test('explorer projects endpoints and vocabulary with owner-supplied descriptions and tombstones', async () => {
  const nodes = await install();
  let state = projectGraphExplorer(await nodes.snapshot(), describe);
  expect(state.subjects.map((subject) => subject.title)).toEqual([
    'Creative work',
    'Mornings',
    'Studio',
  ]);
  expect(state.subjects.find((subject) => subject.id === 'a')).toMatchObject({
    href: '#/source/',
    connections: 1,
  });
  await nodes.commit(request('delete', [await revise(nodes, 'b', null)]));
  state = projectGraphExplorer(await nodes.snapshot(), describe);
  expect(state.subjects.find((subject) => subject.id === 'b')?.state).toBe('deleted');
  nodes.close();
});

test('explorer refreshes on acceptance, retains data on failure, retries and unsubscribes', async () => {
  const nodes = await install();
  let error: Error | undefined;
  const reading = createGraphExplorer(
    {
      ...nodes,
      snapshot: (sequence) => (error ? Promise.reject(error) : nodes.snapshot(sequence)),
    },
    describe,
  );
  reading.start();
  await vi.waitFor(() => expect(reading.snapshot().subjects).toHaveLength(3));
  error = new Error('Refresh failed');
  await reading.reload();
  expect(reading.snapshot()).toMatchObject({
    loading: false,
    error: 'Refresh failed',
  });
  expect(reading.snapshot().subjects).toHaveLength(3);
  error = undefined;
  await nodes.commit(
    request('rename', [await revise(nodes, 'a', { kind: 'content', title: 'Workshop' })]),
  );
  await vi.waitFor(() =>
    expect(reading.snapshot().subjects.some((subject) => subject.title === 'Workshop')).toBe(true),
  );
  expect(reading.snapshot().error).toBeUndefined();
  reading.dispose();
  const disposed = reading.snapshot();
  await nodes.commit(
    request('again', [await revise(nodes, 'a', { kind: 'content', title: 'Changed' })]),
  );
  expect(reading.snapshot()).toBe(disposed);
  expect(reading.closed()).toBe(true);
  nodes.close();
});

test('late reads and failures cannot replace newer snapshots or publish after disposal', async () => {
  const nodes = await install();
  const view = await nodes.snapshot();
  let reject!: (error: Error) => void;
  const pending = new Promise<typeof view>((_, fail) => {
    reject = fail;
  });
  let slow = true;
  const reading = createGraphExplorer(
    { ...nodes, snapshot: () => (slow ? pending : Promise.resolve(view)) },
    describe,
  );
  const first = reading.reload();
  slow = false;
  await reading.reload();
  const selected = reading.snapshot();
  reject(new Error('Old failure'));
  await first;
  expect(reading.snapshot()).toBe(selected);
  let finish!: (value: typeof view) => void;
  const late = createGraphExplorer(
    {
      ...nodes,
      snapshot: () =>
        new Promise((accept) => {
          finish = accept;
        }),
    },
    describe,
  );
  const lateRead = late.reload();
  late.dispose();
  const final = late.snapshot();
  finish(view);
  await lateRead;
  expect(late.snapshot()).toBe(final);
  reading.dispose();
  nodes.close();
});
