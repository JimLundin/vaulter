import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { Dexie } from 'dexie';
import { digest } from '../../nodes/json.ts';
import { nodeCache } from './cache.ts';

const scope = 'fictional-cache-reset';
const name = () => digest(scope).then((hash) => `vaulter-nodes-${hash}`);
afterEach(async () => {
  await Dexie.delete(await name());
});

test('the plaintext node format clears encrypted records and removes the owner store', async () => {
  const old = new Dexie(await name());
  old.version(1).stores({ envelopes: 'id', head: 'id', owner: 'id' });
  const encrypted = { iv: new Uint8Array(12), data: new ArrayBuffer(4) };
  await old.table('envelopes').put({ id: 'old', ...encrypted });
  await old.table('head').put({ id: 'main', ...encrypted });
  await old.table('owner').put({ id: 'key', ...encrypted });
  old.close();
  const cache = await nodeCache(scope);
  expect(await cache.read()).toBeNull();
  cache.close();
  const current = new Dexie(await name());
  await current.open();
  expect(current.tables.map((table) => table.name).sort()).toEqual(['envelopes', 'head']);
  expect(await current.table('envelopes').toArray()).toEqual([]);
  expect(await current.table('head').toArray()).toEqual([]);
  current.close();
});
