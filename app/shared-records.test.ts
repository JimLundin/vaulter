import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { githubNodeBackend } from './vault/storage/nodes/github.ts';
import { fakeGitHub } from './vault/storage/github-client/fake-github.ts';
import { newCacheKey } from './vault/session/crypto.ts';
import { create, request, seed } from './vault/nodes/fixtures.test-support.ts';
import type { NodeBackend } from './vault/nodes/store.ts';
import { createProductConversation, productNodeHistory } from './product.tsx';

test('conversation and transaction projections include writes accepted on independent devices', async () => {
  const fake = await fakeGitHub({});
  const stores: NodeBackend[] = [];
  const open = (_fetch?: unknown, key?: CryptoKey) => {
    const store = githubNodeBackend({
      token: 'test',
      key: key!,
      repo: { owner: 'fictional', name: 'vault', branch: 'main' },
      api: 'https://gh.test',
      fetch: fake.fetchFn,
    });
    stores.push(store);
    return store;
  };
  const first = open(undefined, await newCacheKey());
  await first.refresh();
  await seed(first);
  const second = open(undefined, await newCacheKey());
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
    createProductConversation({
      nodes,
      provider: 'fictional',
      model: async () => {
        throw new Error('Read only');
      },
      selectedModel: 'fictional',
      instructions: '',
    });
  const chatA = readChats(first);
  const chatB = readChats(second);
  expect((await chatA.chats()).map((chat) => chat.node)).toEqual(['chat-a', 'chat-b']);
  expect(await chatB.chats()).toEqual(await chatA.chats());
  expect((await productNodeHistory(first).entries()).map((entry) => entry.transaction.id)).toEqual([
    'device-b',
    'device-a',
    'seed',
  ]);
  expect(await productNodeHistory(second).entries()).toEqual(
    await productNodeHistory(first).entries(),
  );
  chatA.dispose();
  chatB.dispose();
  for (const store of stores) {
    await store.clear();
    store.close();
  }
});
