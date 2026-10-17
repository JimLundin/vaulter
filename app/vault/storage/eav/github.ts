import { Dexie } from 'dexie';
import { serial } from '@/runtime/async.ts';
import {
  ConflictError,
  parseJournal,
  type StorageAdapter,
  type Journal,
  type AppendRequest,
} from '@/vault/eav/index.ts';
import { github, API, REPO, NotFastForward, type Repo } from '@/vault/storage/github-client/api.ts';
import { blobSha } from '@/vault/storage/blob-sha.ts';

const namespace = '.vaulter/eav/transactions/';
const pathOf = (id: string) => `${namespace}${encodeURIComponent(id)}.json`;
const empty: Journal = { schemas: [], commits: [] };

/** Independent EAV journal; unrelated Node/content paths remain in the Git tree. */
export function githubEavAdapter(options: {
  readonly token: string | (() => string);
  readonly repo?: Repo;
  readonly api?: string;
  readonly fetch?: typeof fetch;
}): StorageAdapter {
  const repo = options.repo ?? REPO;
  const api = options.api ?? API;
  const client = () =>
    github(
      typeof options.token === 'function' ? options.token() : options.token,
      repo,
      api,
      options.fetch,
    );
  const scope = JSON.stringify([api, repo.owner, repo.name, repo.branch, namespace]);
  const db = new Dexie(`vaulter-eav-${scope}`);
  db.version(1).stores({ journal: 'key' });
  const cache = db.table<{ key: string; journal: Journal; files: Record<string, string> }, string>(
    'journal',
  );
  const queue = serial();
  let journal = empty;
  let files: Record<string, string> = {};
  let head: { commit: string; tree: string; etag: string } | undefined;
  let closed = false;
  const check = () => {
    if (closed) throw new Error('EAV storage is closed');
  };
  const locked = <T>(work: () => Promise<T>, writing = false) =>
    queue(() => {
      check();
      if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request(`eav:${scope}`, () => {
          check();
          return work();
        });
      if (writing) throw new Error('This browser cannot coordinate EAV writes safely.');
      return work();
    });
  const retain = async () => {
    try {
      await cache.put({ key: 'main', journal, files });
    } catch {
      /* Remote acceptance is authoritative. */
    }
  };
  const synchronize = async (conditional = true) => {
    check();
    const ref = await client().ref(conditional ? head?.etag : undefined);
    check();
    if (!ref) return;
    if (head?.commit === ref.commit) {
      head = { ...head, etag: ref.etag };
      return;
    }
    const tree = await client().tree(ref.commit);
    const nextFiles = Object.fromEntries(
      tree.entries
        .filter(
          (entry) =>
            entry.type === 'blob' &&
            entry.path.startsWith(namespace) &&
            entry.path.endsWith('.json'),
        )
        .map((entry) => [entry.path, entry.sha]),
    );
    for (const [path, sha] of Object.entries(files))
      if (nextFiles[path] !== sha) throw new Error(`EAV history was removed or rewritten: ${path}`);
    const added = Object.entries(nextFiles).filter(([path]) => !files[path]);
    const records: AppendRequest[] = [];
    for (let offset = 0; offset < added.length; offset += 8) {
      // biome-ignore lint/performance/noAwaitInLoops: Bound remote requests per batch.
      records.push(
        ...(await Promise.all(
          added.slice(offset, offset + 8).map(async ([path, sha]) => {
            const value: AppendRequest = JSON.parse(
              new TextDecoder().decode(await client().blob(sha)),
            );
            if (pathOf(value.commit.id) !== path) throw new Error('EAV transaction path mismatch');
            return value;
          }),
        )),
      );
    }
    records.sort((a, b) => a.commit.sequence - b.commit.sequence);
    let next = journal;
    for (const record of records) {
      if (record.base !== (next.commits.at(-1)?.id ?? null))
        throw new Error('EAV journal has a fork or missing transaction');
      for (const [index, schema] of next.schemas.entries())
        if (JSON.stringify(record.schemas[index]) !== JSON.stringify(schema))
          throw new Error('EAV schema history was rewritten');
      next = parseJournal({ schemas: record.schemas, commits: [...next.commits, record.commit] });
    }
    check();
    journal = next;
    files = nextFiles;
    head = { ...ref, tree: tree.sha };
    await retain();
  };
  const accepted = (request: AppendRequest) => {
    const previous = journal.commits.find((commit) => commit.id === request.commit.id);
    if (!previous) return false;
    if (JSON.stringify(previous) !== JSON.stringify(request.commit))
      throw new Error('EAV request identity was reused');
    return true;
  };
  return {
    scope,
    load: () =>
      locked(async () => {
        if (!(head || journal.commits.length)) {
          try {
            const saved = await cache.get('main');
            if (saved) {
              journal = parseJournal(saved.journal);
              files = saved.files;
            }
          } catch {
            await cache.clear().catch(() => undefined);
          }
        }
        try {
          await synchronize();
        } catch (error) {
          // Cached reads are useful offline; integrity errors must remain visible.
          if (!(journal.commits.length && error instanceof TypeError)) throw error;
        }
        return structuredClone(journal);
      }),
    append: (input) =>
      locked(async () => {
        const request = structuredClone(input);
        for (let attempt = 0; attempt < 5; attempt++) {
          // biome-ignore lint/performance/noAwaitInLoops: Revalidate the authoritative base after a Git race.
          await synchronize(false);
          if (accepted(request)) return;
          if (request.base !== (journal.commits.at(-1)?.id ?? null)) throw new ConflictError();
          const next = parseJournal({
            schemas: request.schemas,
            commits: [...journal.commits, request.commit],
          });
          const base = head!;
          const text = JSON.stringify(request);
          const sha = await client().createBlob(text);
          if (sha !== (await blobSha(text))) throw new Error('GitHub stored different EAV bytes');
          const path = pathOf(request.commit.id);
          const tree = await client().createTree(base.tree, [{ path, sha }]);
          const commit = await client().createCommit(
            `Record EAV transaction ${request.commit.id}`,
            tree,
            base.commit,
          );
          check();
          try {
            await client().updateRef(commit);
          } catch (error) {
            if (error instanceof NotFastForward) continue;
            try {
              await synchronize(false);
              if (accepted(request)) return;
            } catch {
              /* Retry retains the same request. */
            }
            throw error;
          }
          journal = next;
          files = { ...files, [path]: sha };
          head = { commit, tree, etag: '' };
          await retain();
          return;
        }
        throw new Error('The remote vault kept advancing; retry this save');
      }, true),
    clear: () => cache.clear(),
    close: () => {
      closed = true;
      db.close();
    },
  };
}
