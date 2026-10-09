// PROTOTYPE: run the same walkthrough against Maps and real Dexie with fake IndexedDB.
import 'fake-indexeddb/auto';
import { nodeOperations } from '../app/vault/nodes/operations.ts';
import { exercise, change } from '../app/vault/nodes/spike/scenarios.ts';
import {
  memorySpikeStore,
  dexieSpikeStore,
  inspectScratch,
  upgradeScratch,
  deleteScratch,
} from '../app/vault/nodes/spike/prototype.ts';

const memory = memorySpikeStore();
const memoryResult = await exercise(memory);
memory.close();
const name = `PROTOTYPE-node-storage-probe-${crypto.randomUUID()}`;
const persistent = await dexieSpikeStore(name);
try {
  const dexieResult = await exercise(persistent);
  const before = (await persistent.snapshot()).sequence;
  const raw = await inspectScratch(name);
  const rawText = JSON.stringify(raw);
  if (
    rawText.includes('paragraph') &&
    (rawText.includes('parent') || rawText.includes('Newer content'))
  )
    throw new Error('Persisted structural/content fields leaked');
  if (
    !(
      (raw.transactions[0] as { data: unknown }).data && (raw.versions[0] as { data: unknown }).data
    )
  )
    throw new Error('Missing encrypted records');
  persistent.close();
  await upgradeScratch(name);
  const reopened = await dexieSpikeStore(name);
  try {
    if ((await reopened.snapshot()).sequence !== before)
      throw new Error('Upgrade/reopen lost history');
    const recordedImport = (await reopened.history({ limit: 100 })).find(
      (t) => t.id === 'custom-kind',
    );
    if (
      recordedImport?.metadata?.imported !== 3 ||
      !Object.isFrozen(recordedImport.metadata) ||
      recordedImport.kind.scope !== 'calendarImport'
    )
      throw new Error('Reload lost structured kind or metadata');
    const other = await dexieSpikeStore(name);
    try {
      const one = await change(reopened, 'page-a', {
        data: { kind: 'document', title: 'Concurrent A' },
      });
      const two = await change(other, 'page-b', {
        data: { kind: 'document', title: 'Concurrent B' },
      });
      const submit = (id: string, changes: readonly (typeof one)[]) => ({
        id,
        changes,
        message: id,
        kind: nodeOperations.update,
        recordedBy: 'actor-user',
        origin: null,
        undoOf: null,
      });
      const independent = await Promise.all([
        reopened.commit(submit('concurrent-a', [one])),
        other.commit(submit('concurrent-b', [two])),
      ]);
      if (new Set(independent.map((t) => t.sequence)).size !== 2)
        throw new Error('Sequences collided');
      const stale1 = await change(reopened, 'paragraph', {
        data: { kind: 'paragraph', text: 'Winner 1' },
      });
      const stale2 = { ...stale1, data: { kind: 'paragraph', text: 'Winner 2' } };
      const sameNode = await Promise.allSettled([
        reopened.commit(submit('same-1', [stale1])),
        other.commit(submit('same-2', [stale2])),
      ]);
      if (sameNode.filter((r) => r.status === 'fulfilled').length !== 1)
        throw new Error('Expected one conflict');
      console.log(
        JSON.stringify(
          {
            memory: memoryResult,
            dexie: dexieResult,
            physicalTables: Object.fromEntries(
              Object.entries(raw).map(([key, rows]) => [key, rows.length]),
            ),
            encryptedContentAndStructure: true,
            upgradeAndReloadPreservedHistory: true,
            independentConcurrentTransactions: independent.map((t) => t.sequence),
            sameNodeConcurrency: sameNode.map((r) => r.status),
          },
          null,
          2,
        ),
      );
    } finally {
      other.close();
    }
  } finally {
    reopened.close();
  }
} finally {
  persistent.close();
  await deleteScratch(name);
}
