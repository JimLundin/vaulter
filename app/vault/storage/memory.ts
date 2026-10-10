// A vault in memory: for tests, and a reference for what a backend must do. Writes are steps with
// history and revert, like git, without the network.
import type { VaultFile } from '../files.ts';
import { blobSha } from './blob-sha.ts';
import {
  Conflict,
  TRAILER,
  type Change,
  type CommitSummary,
  type Head,
  type VaultBackend,
} from './backend.ts';
import { applyOverlay } from '../changes/writer.ts';
import { serial } from './coordination.ts';

export function memoryBackend(initial: Record<string, string>) {
  let files: VaultFile[] = Object.entries(initial).map(([path, text]) => ({ path, text }));
  const steps: (CommitSummary & { before: VaultFile[]; changes: Change[] })[] = [];
  // Every change, by hand or elsewhere, oldest first: what since() reads.
  const log: { date: string; before: VaultFile[]; paths: string[] }[] = [];
  const logged = (before: VaultFile[], paths: string[]) =>
    log.push({ date: new Date().toISOString(), before, paths });
  let version = 0;
  let seen = -1;
  const kept = new Map<string, unknown>();
  const keptListeners = new Set<() => void>();
  const listeners = new Set<() => void>();
  const head = (): Head => ({ files, version: String(version) });
  const apply = (changes: Change[]) =>
    applyOverlay(files, {
      version: 0,
      from: {},
      files: Object.fromEntries(changes.map((c) => [c.path, c.text])),
    });
  const step = async (changes: Change[], message: string) => {
    const before = files;
    files = apply(changes);
    version++;
    logged(
      before,
      changes.map((c) => c.path),
    );
    const sha = (await blobSha(`${version}:${message}`)).slice(0, 12);
    steps.unshift({
      sha,
      message: `${message}\n\n${TRAILER}`,
      date: new Date().toISOString(),
      before,
      changes,
    });
    return { head: head(), commit: sha };
  };

  const backend: VaultBackend = {
    coordinate: serial(),
    cached: async () => head(),
    refresh: () => {
      const fresh = seen !== version;
      seen = version;
      return Promise.resolve(fresh ? head() : null);
    },
    watch: (on) => {
      listeners.add(on);
      return () => {
        listeners.delete(on);
      };
    },
    write: async (changes, message, verify) => {
      await verify(files, apply(changes));
      return step(changes, message);
    },
    history: async () => steps.map(({ sha, message, date }) => ({ sha, message, date })),
    patch: async (sha) =>
      (steps.find((s) => s.sha === sha)?.changes ?? []).map((c) => ({ filename: c.path })),
    revert: async (sha, verify) => {
      const s = steps.find((x) => x.sha === sha);
      if (!s) throw new Error(`no step ${sha}`);
      const now = new Map(files.map((f) => [f.path, f.text]));
      const was = new Map(s.before.map((f) => [f.path, f.text]));
      const stale = s.changes
        .filter((c) => (now.get(c.path) ?? null) !== c.text)
        .map((c) => c.path);
      if (stale.length) throw new Conflict(stale);
      const undo = s.changes.map((c) => ({ path: c.path, text: was.get(c.path) ?? null }));
      await verify(files, apply(undo));
      return step(undo, `Revert "${s.message.split('\n')[0]}"`);
    },
    since: (day) => {
      const after = log.filter((e) => e.date >= day);
      const then = new Map((after[0]?.before ?? files).map((f) => [f.path, f.text]));
      return Promise.resolve({
        changed: new Set(after.flatMap((e) => e.paths)),
        before: async (path) => then.get(path) ?? null,
      });
    },
    keep: {
      get: async <T>(k: string) => (kept.get(k) as T) ?? null,
      set: (k, v) => {
        if (v == null) kept.delete(k);
        else kept.set(k, v);
        if (k === 'overlay') for (const on of keptListeners) on();
        return Promise.resolve();
      },
      watch: (on) => {
        keptListeners.add(on);
        return () => {
          keptListeners.delete(on);
        };
      },
    },
  };
  /** For tests: a change made elsewhere. */
  const push = (change: Record<string, string | null>) => {
    logged(files, Object.keys(change));
    files = apply(Object.entries(change).map(([path, text]) => ({ path, text })));
    version++;
    for (const f of listeners) f();
  };
  return { backend, push, files: () => files };
}
