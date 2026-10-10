// GitHub is authoritative; local cache publication never counts as remote acceptance.
import type { NodeBackend, NodeCommit } from '../../nodes/store.ts';
import { parseCommit, parseRecord, type NodeRecord } from '../../nodes/validation.ts';
import { accept, validateRecords } from '../../nodes/history.ts';
import { canonical, digest } from '../../nodes/json.ts';
import { nodeInterface, notifications } from '../../nodes/backend.ts';
import { github, NotFastForward, REPO, API, type Repo } from '../github-client/api.ts';
import { blobSha } from '../blob-sha.ts';
import { serial } from '../coordination.ts';
import { nodeCache, type RemoteHead } from './cache.ts';

export const NODE_NAMESPACE = '.vaulter/nodes/v1/transactions/';
const pathOf = (id: string) => `${NODE_NAMESPACE}${encodeURIComponent(id)}.json`;

/** Read-only/offline access remains available; writes require remote acceptance and Web Locks. */
export function githubNodeBackend(options: {
  token: string;
  key: CryptoKey;
  repo?: Repo;
  api?: string;
  fetch?: typeof fetch;
}): NodeBackend {
  const repo = options.repo ?? REPO;
  const api = options.api ?? API;
  const client = github(options.token, repo, api, options.fetch);
  const scope = JSON.stringify([api, repo.owner, repo.name, repo.branch, NODE_NAMESPACE]);
  const local = serial();
  const events = notifications();
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`nodes:${scope}`);
  let cache: Awaited<ReturnType<typeof nodeCache>> | undefined;
  let head: RemoteHead | null = null;
  let records: readonly NodeRecord[] = Object.freeze([]);
  let closed = false;
  const checkOpen = () => {
    if (closed) throw new Error('Node store is closed');
  };
  const locked = <T>(operation: () => Promise<T>, write = false): Promise<T> =>
    local(() => {
      checkOpen();
      if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request(`nodes:${scope}`, () => {
          checkOpen();
          return operation();
        });
      if (write) throw new Error('This browser cannot coordinate node writes safely.');
      return operation();
    });
  const deviceCache = async () => {
    cache ??= await nodeCache(options.key, scope);
    if (closed) cache.close();
    checkOpen();
    return cache;
  };
  const adoptCache = async () => {
    if (head) return;
    const device = await deviceCache();
    const saved = await device
      .read()
      .then((value) => {
        if (
          value &&
          (Object.keys(value.head.files).length !== value.records.length ||
            value.records.some(
              (record) => !Object.hasOwn(value.head.files, pathOf(record.transaction.id)),
            ))
        )
          throw new Error('Cached history does not match its remote head');
        return value;
      })
      .catch(async () => {
        // Corrupt rebuildable cache must not prevent fetching authoritative history.
        await device.clear();
        return null;
      });
    if (saved) {
      ({ head, records } = saved);
      events.notify();
    }
  };
  const cacheAccepted = async (remote: RemoteHead, values: readonly NodeRecord[]) => {
    // Once GitHub accepted, failure of the device cache must not report the operation as rejected.
    try {
      await (await deviceCache()).write(remote, values);
    } catch {
      /* Rebuild from remote on the next open. */
    }
  };
  const synchronize = async (conditional = true) => {
    checkOpen();
    const ref = await client.ref(conditional ? (head?.etag ?? '') : '');
    checkOpen();
    if (!ref) return;
    if (ref.commit === head?.commit) {
      head = { ...head, etag: ref.etag };
      return;
    }
    const tree = await client.tree(ref.commit);
    const files = Object.fromEntries(
      tree.entries
        .filter(
          (entry) =>
            entry.path.startsWith(NODE_NAMESPACE) &&
            entry.path.endsWith('.json') &&
            entry.type === 'blob',
        )
        .map((entry) => [entry.path, entry.sha]),
    );
    // Existing accepted paths are immutable, even when external Git writers touch the repository.
    for (const [path, sha] of Object.entries(head?.files ?? {}))
      if (files[path] !== sha)
        throw new Error(`Recorded node history was removed or rewritten: ${path}`);
    const existing = new Map(records.map((record) => [pathOf(record.transaction.id), record]));
    const loaded: NodeRecord[] = [...records];
    const newPaths = Object.entries(files).filter(([path]) => !existing.has(path));
    // Bound GitHub requests; one large log must not launch thousands of concurrent blob reads.
    for (let offset = 0; offset < newPaths.length; offset += 8) {
      // biome-ignore lint/performance/noAwaitInLoops: bounded batches avoid GitHub secondary limits.
      const batch = await Promise.all(
        newPaths.slice(offset, offset + 8).map(async ([path, sha]) => {
          const bytes = await client.blob(sha);
          const record = parseRecord(JSON.parse(new TextDecoder().decode(bytes)));
          if (pathOf(record.transaction.id) !== path)
            throw new Error('Transaction path does not match its identity');
          return record;
        }),
      );
      loaded.push(...batch);
    }
    const accepted = newPaths.length
      ? validateRecords(
          loaded.sort((a, b) => a.transaction.sequence - b.transaction.sequence),
          records,
        )
      : records;
    const next: RemoteHead = { commit: ref.commit, tree: tree.sha, etag: ref.etag, files };
    checkOpen();
    head = next;
    records = accepted;
    await cacheAccepted(next, accepted);
    events.notify();
  };
  const append = async (input: NodeCommit): Promise<NodeRecord> => {
    const request = parseCommit(input);
    const requestDigest = await digest(request);
    await adoptCache();
    for (let attempt = 0; attempt < 5; attempt++) {
      // biome-ignore lint/performance/noAwaitInLoops: each retry validates against authoritative history.
      await synchronize(false);
      checkOpen();
      const base = head!;
      const record = accept(records, request, requestDigest, new Date().toISOString());
      if (records.includes(record)) return record;
      const path = pathOf(record.transaction.id);
      const text = canonical(record);
      const sha = await client.createBlob(text);
      if (sha !== (await blobSha(text)))
        throw new Error('GitHub stored a different transaction envelope');
      const tree = await client.createTree(base.tree, [{ path, sha }]);
      const commit = await client.createCommit(
        `Record node transaction\n\nNode-Transaction: ${record.transaction.id}`,
        tree,
        base.commit,
      );
      checkOpen();
      try {
        await client.updateRef(commit);
      } catch (error) {
        if (error instanceof NotFastForward) continue;
        // A lost response may follow a successful ref update. Check retry identity before failing.
        try {
          await synchronize(false);
          const accepted = records.find((value) => value.transaction.id === request.id);
          if (accepted) {
            if (accepted.requestDigest !== requestDigest)
              throw new Error('Transaction ID reused with different contents', { cause: error });
            return accepted;
          }
        } catch {
          /* Preserve the original transport failure; retrying the same ID is safe. */
        }
        throw error;
      }
      records = Object.freeze([...records, record]);
      head = { commit, tree, etag: '', files: { ...base.files, [path]: sha } };
      await cacheAccepted(head, records);
      events.notify();
      if (!closed) {
        try {
          channel?.postMessage('committed');
        } catch {
          /* Notifications are hints after acceptance. */
        }
      }
      return record;
    }
    throw new Error('Node history kept advancing; retry this transaction');
  };
  if (channel)
    channel.onmessage = (event) => {
      if (event.data === 'committed') locked(() => synchronize(false)).catch(() => undefined);
    };
  return nodeInterface({
    read: () => records,
    append: (request) => locked(() => append(request), true),
    cached: () => locked(adoptCache),
    refresh: () =>
      locked(async () => {
        await adoptCache();
        await synchronize();
      }),
    clear: () =>
      locked(async () => {
        await (await deviceCache()).clear();
        head = null;
        records = Object.freeze([]);
        events.notify();
      }),
    close: () => {
      closed = true;
      channel?.close();
      cache?.close();
      events.close();
    },
    subscribe: events.subscribe,
  });
}
