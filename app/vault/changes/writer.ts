// Staging and committing, for any backend: what the agent writes through. Edits wait in an
// overlay over the head (kept on the device by the backend, so a reload loses nothing); a commit writes
// them as one step, refused if they add a problem (the vault's rules), or if a staged file
// changed meanwhile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyChanges, type Change, type FileRules, type VaultFile } from '../files.ts';
import { blobSha } from '../storage/blob-sha.ts';
import { StagedChanges, type Vault, type OwnedVault, type WriteOptions } from './operations.ts';
import { cancellable, serial } from '../storage/coordination.ts';
import {
  CheckFailed,
  Conflict,
  type Head,
  type VaultBackend,
  type Verify,
} from '../storage/backend.ts';

/** path -> new text, or null to delete; `from`: each path's content id when first staged (null: new file). */
export interface Overlay {
  version: number;
  files: Record<string, string | null>;
  from: Record<string, string | null>;
}

export const applyOverlay = (files: VaultFile[], o: Overlay | null): VaultFile[] =>
  o
    ? applyChanges(
        files,
        Object.entries(o.files).map(([path, text]) => ({ path, text })),
      )
    : files;

/** The gate every write passes: a problem the change adds refuses it. */
export const gate =
  (rules: FileRules): Verify =>
  async (before, after) => {
    const problems = await rules.problems(before, after);
    if (problems.length) throw new CheckFailed(problems);
  };

export interface Writer {
  /** The files at the head, before staged edits. */
  base: VaultFile[];
  overlay: Overlay | null;
  stage: (path: string, text: string | null) => Promise<void>;
  stageMany: Vault['stageMany'];
  update: Vault['update'];
  write: Vault['write'];
  unstage: (path: string) => Promise<void>;
  discard: () => Promise<void>;
  /** Null where the backend can't write. */
  commit: ((message: string) => Promise<string>) | null;
  revert: ((sha: string) => Promise<string>) | null;
  history: VaultBackend['history'];
  patch: VaultBackend['patch'];
  /** The latest base and overlay, outside render: for code that runs between renders (the agent's tools). */
  current: () => { base: VaultFile[]; overlay: Overlay | null };
  /** The problems the staged edits add (empty: a commit will pass). */
  problems: () => Promise<string[]>;
}

/** The writer without React: the overlay, staging and the commit over a backend. useWriter wraps it. */
export function writerCore(
  backend: VaultBackend | null,
  rules: FileRules,
  base: () => VaultFile[],
  onWritten: (h: Head) => void,
  onOverlay: (o: Overlay | null) => void = () => undefined,
) {
  let overlay: Overlay | null = null;
  const publish = (next: Overlay | null) => {
    if (JSON.stringify(overlay) === JSON.stringify(next)) return;
    overlay = next;
    onOverlay(overlay);
  };
  const change = async (o: Overlay | null) => {
    const next = o && Object.keys(o.files).length ? o : null;
    await backend?.keep.set('overlay', next);
    publish(next);
  };
  const local = serial();
  const coordinate = backend?.coordinate ?? serial();
  const verify = gate(rules);

  const write = <T>(
    operation: (vault: OwnedVault) => Promise<T>,
    options: WriteOptions,
  ): Promise<T> =>
    local(
      () =>
        coordinate(async () => {
          let source = base();
          const readHead = async () => {
            const head = await backend?.cached();
            if (head) {
              source = head.files;
              onWritten(head);
            }
          };
          await readHead();
          if (backend) publish((await backend.keep.get<Overlay>('overlay')) ?? null);
          options.signal?.throwIfAborted();
          if (options.staged === 'reject' && overlay)
            throw new StagedChanges(Object.keys(overlay.files));
          if (Array.isArray(options.staged)) {
            const reviewed = new Map(options.staged.map(({ path, text }) => [path, text]));
            const current = Object.entries(overlay?.files ?? {});
            if (
              reviewed.size !== current.length ||
              current.some(([path, text]) => reviewed.get(path) !== text)
            )
              throw new Error(
                'The staged changes changed after review. Review them again before sending.',
              );
          }

          let active = true;
          let pending: Promise<unknown> = Promise.resolve();
          const guard = () => {
            options.signal?.throwIfAborted();
            if (!active) throw new Error('This vault write operation has finished.');
          };
          const enqueue = <R>(action: () => Promise<R>): Promise<R> => {
            const run = pending.then(() => {
              guard();
              return action();
            });
            pending = run.catch(() => undefined);
            return run;
          };
          const stageMany = async (changes: Change[]) => {
            const o = overlay ?? { version: 0, files: {}, from: {} };
            const files = { ...o.files };
            const from = { ...o.from };
            for (const { path, text } of changes) {
              const original = source.find((f) => f.path === path)?.text;
              if (text !== null && !rules.keeps(path))
                throw new Error(`${path} isn't a file the app keeps: ${rules.what}`);
              if (text === null && original === undefined && typeof files[path] !== 'string')
                throw new Error(`no such file: ${path}`);
              if (!(path in files)) {
                // biome-ignore lint/performance/noAwaitInLoops: each change builds on the previous one
                from[path] = original === undefined ? null : await blobSha(original);
              }
              if (text === original || (text === null && original === undefined)) {
                delete files[path];
                delete from[path];
              } else files[path] = text;
            }
            guard();
            await change({ version: o.version + 1, files, from });
          };
          const written = (r: { head: Head; commit: string }) => {
            source = r.head.files;
            onWritten(r.head);
            return r.commit;
          };
          const vault: OwnedVault = {
            base: () => {
              guard();
              return source;
            },
            files: () => {
              guard();
              return applyOverlay(source, overlay);
            },
            staged: () => {
              guard();
              return Object.keys(overlay?.files ?? {});
            },
            stage: (path, text) => enqueue(() => stageMany([{ path, text }])),
            stageMany: (changes) => enqueue(() => stageMany(changes)),
            update: (calculate) =>
              enqueue(async () =>
                stageMany(
                  await cancellable(
                    Promise.resolve().then(() => calculate(vault.files())),
                    options.signal,
                  ),
                ),
              ),
            commit: backend?.write
              ? (message) =>
                  enqueue(async () => {
                    const o = overlay;
                    if (!o) throw new Error('nothing is staged');
                    // Check identities inside backend verification as well: cache sync can advance the head
                    // between starting this sequence and writing it, even in the same tab.
                    const checked: Verify = async (before, after) => {
                      const now = new Map(before.map((f) => [f.path, f.text]));
                      const paths = Object.keys(o.from);
                      const shas = await Promise.all(
                        paths.map((p) => {
                          const text = now.get(p);
                          return text === undefined ? null : blobSha(text);
                        }),
                      );
                      const stale = paths.filter((p, i) => shas[i] !== o.from[p]);
                      if (stale.length) throw new Conflict(stale);
                      await verify(before, after);
                      guard();
                    };
                    const result = await backend.write!(
                      Object.entries(o.files).map(([path, text]) => ({ path, text })),
                      message,
                      checked,
                    );
                    await change(null);
                    return written(result);
                  })
              : null,
            revert: backend?.revert
              ? (sha) =>
                  enqueue(async () => {
                    if (overlay) throw new StagedChanges(Object.keys(overlay.files));
                    return written(
                      await backend.revert!(sha, async (before, after) => {
                        await verify(before, after);
                        guard();
                      }),
                    );
                  })
              : null,
            history: backend?.history ?? null,
            patch: backend?.patch ?? null,
            problems: () => enqueue(() => rules.problems(source, applyOverlay(source, overlay))),
          };
          try {
            return await cancellable(
              Promise.resolve().then(() => operation(vault)),
              options.signal,
            );
          } finally {
            active = false;
            // In-flight persistence/remote writes settle before another owner can enter. Queued calls
            // and producers that finish late see an expired handle and cannot start a new mutation.
            await pending;
          }
        }, options.signal),
      options.signal,
    );

  const run = <T>(operation: (vault: OwnedVault) => Promise<T>) =>
    write(operation, { staged: 'include' });
  return {
    get overlay() {
      return overlay;
    },
    load: () => run(async () => undefined),
    watch: () =>
      backend?.keep.watch?.(() => {
        run(async () => undefined).catch((error: unknown) => reportError(error));
      }) ?? (() => undefined),
    stage: (path: string, text: string | null) => run((vault) => vault.stage(path, text)),
    stageMany: (changes: Change[]) => run((vault) => vault.stageMany(changes)),
    update: (calculate: Parameters<Vault['update']>[0]) => run((vault) => vault.update(calculate)),
    write,
    unstage: (path: string) =>
      run(async () => {
        if (!overlay) return;
        const { [path]: _, ...files } = overlay.files;
        const { [path]: __, ...from } = overlay.from;
        await change({ version: overlay.version + 1, files, from });
      }),
    discard: () => run(() => change(null)),
    commit: backend?.write ? (message: string) => run((vault) => vault.commit!(message)) : null,
    revert: backend?.revert ? (sha: string) => run((vault) => vault.revert!(sha)) : null,
    problems: () => run((vault) => vault.problems()),
  };
}

export function useWriter(
  backend: VaultBackend | null,
  rules: FileRules,
  head: Head | null,
  onWritten: (h: Head) => void,
): Writer {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const base = useRef<VaultFile[]>([]);
  base.current = head?.files ?? [];
  const core = useMemo(
    () =>
      writerCore(
        backend,
        rules,
        () => base.current,
        (h) => {
          base.current = h.files;
          onWritten(h);
        },
        setOverlay,
      ),
    [backend, rules, onWritten],
  );
  useEffect(() => {
    core.load().catch((error: unknown) => reportError(error));
    return core.watch();
  }, [core]);
  return {
    base: base.current,
    overlay,
    stage: core.stage,
    stageMany: core.stageMany,
    update: core.update,
    write: core.write,
    unstage: core.unstage,
    discard: core.discard,
    commit: core.commit,
    revert: core.revert,
    history: backend?.history ?? null,
    patch: backend?.patch ?? null,
    current: () => ({ base: base.current, overlay: core.overlay }),
    problems: core.problems,
  };
}
