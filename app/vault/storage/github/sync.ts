// Keeps the device cache in step with main: render from the cache, ask whether main moved (a 304
// costs nothing), and if it did, fetch only the blobs not yet cached, each checked against its sha.
import type { VaultFile } from '../../files.ts';
import { db } from './cache.ts';
import type { GitHub } from '../github-client/api.ts';

export interface Snapshot {
  commit: string;
  tree: string;
  etag: string;
  fetchedAt: number;
  files: Record<string, string>;
}
interface SnapshotRecord {
  id: 'main';
  files: Record<string, string>;
  commit: string;
  tree: string;
  etag: string;
  fetchedAt: number;
}
export interface BlobRecord {
  sha: string;
  text: string;
}

const PARALLEL = 6;
const text = new TextDecoder();

/** The cached snapshot and its files, or null when nothing is cached (or it can't be read). */
export async function readCache(): Promise<{ snapshot: Snapshot; files: VaultFile[] } | null> {
  const rec = await db.get<SnapshotRecord>('snapshot', 'main');
  if (!rec) return null;
  try {
    const { files } = rec;
    const blobs = new Map((await db.getAll<BlobRecord>('blobs')).map((b) => [b.sha, b]));
    const out = Object.entries(files).map(([path, sha]) => {
      const b = blobs.get(sha);
      if (!b || typeof b.text !== 'string') throw new Error(`missing blob text ${sha}`);
      return { path, text: b.text };
    });
    const { commit, tree, etag, fetchedAt } = rec;
    return { snapshot: { commit, tree, etag, fetchedAt, files }, files: out };
  } catch {
    return null; // an incomplete or foreign cache: the next sync rebuilds it
  }
}

/**
 * Brings the cache up to main. Returns the new snapshot and files when main moved (or nothing was
 * cached), null when the cache is already current.
 */
export async function sync(
  gh: GitHub,
  cached: Snapshot | null,
  now = Date.now(),
): Promise<{ snapshot: Snapshot; files: VaultFile[] } | null> {
  const ref = await gh.ref(cached?.etag);
  if (!ref) return null;
  if (cached && ref.commit === cached.commit) {
    await writeSnapshot({ ...cached, etag: ref.etag, fetchedAt: now }, []);
    return null;
  }
  const tree = await gh.tree(ref.commit);
  const files: Record<string, string> = {};
  for (const e of tree.entries) if (e.type === 'blob') files[e.path] = e.sha;

  const have = new Set((await db.getAll<BlobRecord>('blobs')).map((b) => b.sha));
  const missing = [...new Set(Object.values(files))].filter((s) => !have.has(s));
  const fetched: BlobRecord[] = [];
  for (let i = 0; i < missing.length; i += PARALLEL) {
    // biome-ignore lint/performance/noAwaitInLoops: PARALLEL blobs at a time, batch after batch, to stay under GitHub's limits
    await Promise.all(
      missing.slice(i, i + PARALLEL).map(async (sha) => {
        const bytes = await gh.blob(sha);
        fetched.push({ sha, text: text.decode(bytes) });
      }),
    );
  }
  const snapshot: Snapshot = {
    commit: ref.commit,
    tree: tree.sha,
    etag: ref.etag,
    fetchedAt: now,
    files,
  };
  await writeSnapshot(snapshot, fetched);
  await gc(new Set(Object.values(files)));

  const cachedFiles = await readCache();
  if (!cachedFiles) throw new Error('the cache could not be read back after syncing');
  return cachedFiles;
}

/** New blobs and the snapshot in one transaction, so the snapshot never points at a missing blob. */
export async function writeSnapshot(s: Snapshot, blobs: BlobRecord[]) {
  const { files, ...head } = s;
  await db.tx(['blobs', 'snapshot'], 'readwrite', (t) => {
    for (const b of blobs) t.objectStore('blobs').put(b);
    t.objectStore('snapshot').put({ id: 'main', ...head, files } satisfies SnapshotRecord);
  });
}

/** Drops blobs nothing refers to. The overlay holds text, not shas, so it pins nothing here. */
export async function gc(keep: Set<string>) {
  await db.tx(
    ['blobs'],
    'readwrite',
    (t) =>
      new Promise<void>((ok) => {
        const r = t.objectStore('blobs').openKeyCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return ok();
          if (!keep.has(String(c.key))) t.objectStore('blobs').delete(c.key);
          c.continue();
        };
      }),
  );
}
