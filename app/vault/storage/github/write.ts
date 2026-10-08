// Writing through the Git Data API: blobs, a tree on main's, a commit, and main moved to it, never by
// force. When main moved meanwhile, the commit is rebuilt on it, unless one of the same files changed
// there (a Conflict). `verify` (the app's check) runs on every attempt.
import type { VaultFile } from '../../files.ts';
import { blobSha } from '../blob-sha.ts';
import { Conflict, TRAILER, type Change, type Verify } from '../backend.ts';
import { applyOverlay } from '../../changes/writer.ts';
import { encrypt } from '../../session/crypto.ts';
import { NotFastForward, type GitHub, type TreeChange } from '../github-client/api.ts';
import { gc, sync, writeSnapshot, type BlobRecord, type Snapshot } from './sync.ts';

/** What a commit does to one path: a blob (with its text) or a deletion. */
type Blob = { path: string; sha: string; text: string } | { path: string; sha: null };

const after = (files: VaultFile[], blobs: Blob[]) =>
  applyOverlay(files, {
    version: 0,
    from: {},
    files: Object.fromEntries(blobs.map((b) => [b.path, b.sha === null ? null : b.text])),
  });

async function writeCommit(
  key: CryptoKey,
  gh: GitHub,
  base: Snapshot,
  baseFiles: VaultFile[],
  blobs: Blob[],
  message: string,
  verify: Verify,
) {
  let snap = base;
  let files = baseFiles;
  const full = message.includes(TRAILER) ? message : `${message.trim()}\n\n${TRAILER}`;
  for (let attempt = 0; ; attempt++) {
    const next = after(files, blobs);
    // biome-ignore lint/performance/noAwaitInLoops: each attempt is built on the main the last one lost to
    await verify(files, next);
    const tree = await gh.createTree(
      snap.tree,
      blobs.map((b): TreeChange => ({ path: b.path, sha: b.sha })),
    );
    const commit = await gh.createCommit(full, tree, snap.commit);
    try {
      await gh.updateRef(commit);
    } catch (e) {
      if (!(e instanceof NotFastForward) || attempt >= 3) throw e;
      const moved = await sync(key, gh, snap);
      if (!moved) throw e;
      const conflicts = blobs
        .map((b) => b.path)
        .filter((p) => moved.snapshot.files[p] !== snap.files[p]);
      if (conflicts.length) throw new Conflict(conflicts, { cause: e });
      ({ snapshot: snap, files } = moved);
      continue;
    }
    // Cache what was written: the new blobs and the snapshot after the commit.
    const shas = { ...snap.files };
    for (const b of blobs)
      if (b.sha === null) delete shas[b.path];
      else shas[b.path] = b.sha;
    const records: BlobRecord[] = await Promise.all(
      blobs
        .filter((b): b is Extract<Blob, { text: string }> => b.sha !== null)
        .map(async (b) => ({
          sha: b.sha,
          ...(await encrypt(key, new TextEncoder().encode(b.text), b.sha)),
        })),
    );
    const snapshot: Snapshot = { commit, tree, etag: '', fetchedAt: Date.now(), files: shas };
    await writeSnapshot(key, snapshot, records);
    await gc(new Set(Object.values(shas)));
    return { snapshot, files: next, commit };
  }
}

/** Commits the changes as one commit. */
export async function commitChanges(
  key: CryptoKey,
  gh: GitHub,
  snap: Snapshot,
  files: VaultFile[],
  changes: Change[],
  message: string,
  verify: Verify,
) {
  const blobs = await Promise.all(
    changes.map(async ({ path, text }): Promise<Blob> => {
      if (text === null) return { path, sha: null };
      const sha = await gh.createBlob(text);
      if (sha !== (await blobSha(text))) throw new Error(`GitHub stored ${path} as something else`);
      return { path, sha, text };
    }),
  );
  return writeCommit(key, gh, snap, files, blobs, message, verify);
}

/** Undoes one commit as a new commit; a file changed since then is a conflict. */
export async function revertCommit(
  key: CryptoKey,
  gh: GitHub,
  snap: Snapshot,
  files: VaultFile[],
  sha: string,
  verify: Verify,
) {
  const c = await gh.commit(sha);
  if (!c.parent) throw new Error('cannot revert the first commit');
  const before = new Map((await gh.tree(c.parent)).entries.map((e) => [e.path, e.sha]));
  const text = async (s: string) => new TextDecoder().decode(await gh.blob(s));
  const blobs: Blob[] = [];
  const conflicts: string[] = [];
  const restore = async (path: string) => {
    const old = before.get(path);
    blobs.push(old ? { path, sha: old, text: await text(old) } : { path, sha: null });
  };
  for (const f of c.files) {
    if (f.status === 'renamed' && f.previous_filename) {
      if (snap.files[f.filename] !== f.sha || snap.files[f.previous_filename])
        conflicts.push(f.filename);
      else {
        blobs.push({ path: f.filename, sha: null });
        // biome-ignore lint/performance/noAwaitInLoops: one blob at a time: a commit may touch many files, and GitHub limits concurrent requests
        await restore(f.previous_filename);
      }
    } else if (f.status === 'removed') {
      if (snap.files[f.filename]) conflicts.push(f.filename);
      else await restore(f.filename);
    } else if (snap.files[f.filename] !== f.sha) conflicts.push(f.filename);
    else await restore(f.filename);
  }
  if (conflicts.length) throw new Conflict(conflicts);
  return writeCommit(
    key,
    gh,
    snap,
    files,
    blobs,
    `Revert "${c.message.split('\n')[0]}"\n\nThis reverts commit ${sha}.`,
    verify,
  );
}
