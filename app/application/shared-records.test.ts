import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import {
  createPersistentStorage,
  refreshStorage,
  closeStorage,
  type JournalStorage,
} from '@/core/store/index.ts';
import { githubEavAdapter } from '@/core/persistence/journal/github.ts';
import { fakeGitHub } from '@/core/persistence/github-client/fake-github.ts';
import { serial } from '@/shared/async/async.ts';
import { wikiActions } from '@/modules/wiki/operations.ts';
import { readEavWiki } from '@/modules/wiki/pages.ts';
import { applicationDatabase, applicationHistory } from './composition/composition.ts';

test('Wiki and History projections include writes accepted on independent devices', async () => {
  const queue = serial();
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, work: () => Promise<unknown>) => queue(work) },
  });
  const fake = await fakeGitHub({});
  const stores: JournalStorage[] = [];
  const open = () => {
    const storage = createPersistentStorage(
      githubEavAdapter({
        token: 'test',
        repo: { owner: 'fictional', name: 'shared-records', branch: 'main' },
        api: 'https://gh.test',
        fetch: fake.fetchFn,
      }),
    );
    stores.push(storage);
    return storage;
  };
  try {
    const first = open();
    const firstDb = await applicationDatabase(first);
    const author = await firstDb.transaction((tx) =>
      tx.entities.actors.insert({ name: 'Editor', kind: 'user' }),
    );
    const second = open();
    const secondDb = await applicationDatabase(second);
    await wikiActions(firstDb, author).createPage({
      key: 'device-a',
      title: 'Device A',
      summary: '',
    });
    await refreshStorage(second);
    const secondAuthor = (await secondDb.entities.actors.first({ select: {} }))!;
    await wikiActions(secondDb, secondAuthor).createPage({
      key: 'device-b',
      title: 'Device B',
      summary: '',
    });
    await refreshStorage(first);
    expect((await readEavWiki(firstDb)).map((page) => page.title).sort()).toEqual([
      'Device A',
      'Device B',
    ]);
    expect((await readEavWiki(secondDb)).map((page) => page.title).sort()).toEqual([
      'Device A',
      'Device B',
    ]);
    expect(await applicationHistory(second).entries()).toEqual(
      await applicationHistory(first).entries(),
    );
    expect((await applicationHistory(first).entries()).map((entry) => entry.author)).toEqual([
      'Editor',
      'Editor',
      undefined,
    ]);
  } finally {
    for (const storage of stores) closeStorage(storage);
    vi.unstubAllGlobals();
  }
});
