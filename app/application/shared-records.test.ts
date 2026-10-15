import { transactionFixture } from '../vault/transactions/fixtures.test-support.ts';
import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { githubNodeBackend } from '../vault/storage/nodes/github.ts';
import { fakeGitHub } from '../vault/storage/github-client/fake-github.ts';
import { create, request, seed } from '../vault/nodes/fixtures.test-support.ts';
import type { NodeBackend } from '../vault/nodes/store.ts';
import { createApplicationConversation, applicationNodeHistory } from './composition.ts';

test('conversation and transaction projections include writes accepted on independent devices', async () => {
  const fake = await fakeGitHub({});
  const stores: NodeBackend[] = [];
  const open = () => {
    const store = githubNodeBackend({
      token: 'test',
      repo: { owner: 'fictional', name: 'vault', branch: 'main' },
      api: 'https://gh.test',
      fetch: fake.fetchFn,
    });
    stores.push(store);
    return store;
  };
  const first = open();
  await first.refresh();
  await seed(first);
  const second = open();
  await second.refresh();
  const at = '2026-01-01T12:00:00Z';
  await first.commit(
    request('device-a', [
      create('chat-a', { kind: 'conversation', title: 'Device A', createdAt: at }),
    ]),
  );
  await second.commit(
    request('device-b', [
      create('chat-b', { kind: 'conversation', title: 'Device B', createdAt: at }),
    ]),
  );
  await first.refresh();
  await second.refresh();

  const readChats = (nodes: NodeBackend) =>
    createApplicationConversation({
      nodes: transactionFixture(nodes),
      provider: 'fictional',
      model: () => Promise.reject(new Error('Read only')),
      selectedModel: 'fictional',
      instructions: '',
    });
  const chatA = readChats(first);
  const chatB = readChats(second);
  const closeA = chatA.watchRecords();
  const closeB = chatB.watchRecords();
  await vi.waitFor(() => {
    expect(chatA.snapshot().records.chats?.map((chat) => chat.node)).toEqual(['chat-a', 'chat-b']);
    expect(chatB.snapshot().records.chats).toEqual(chatA.snapshot().records.chats);
  });
  closeA();
  closeB();
  expect(
    (await applicationNodeHistory(transactionFixture(first)).entries()).map(
      (entry) => entry.transaction.id,
    ),
  ).toEqual(['device-b', 'device-a', 'seed']);
  expect(await applicationNodeHistory(transactionFixture(second)).entries()).toEqual(
    await applicationNodeHistory(transactionFixture(first)).entries(),
  );
  chatA.dispose();
  chatB.dispose();
  await Promise.all(stores.map((store) => store.clear()));
  for (const store of stores) store.close();
});
