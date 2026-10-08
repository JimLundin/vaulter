// Staging and committing, for any backend: what the editor and the agent write through. Edits wait in an
// overlay over the head (kept on the device by the backend, so a reload loses nothing); a commit writes
// them as one step, refused if they add a problem (the features' `files` rules), or if a staged file
// changed meanwhile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyChanges, type FileRules, type VaultFile } from './files.ts';
import { blobSha } from './blob-sha.ts';
import { CheckFailed, Conflict, type Head, type VaultBackend, type Verify } from './backend.ts';

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

/** The writer as the agent's tools see it: always the latest state, never a render's snapshot. */
export interface AgentWriter {
  base: () => VaultFile[];
  files: () => VaultFile[];
  staged: () => string[];
  stage: (path: string, text: string | null) => Promise<void>;
  commit: ((message: string) => Promise<string>) | null;
  problems: () => Promise<string[]>;
}
export const agentWriter = (w: () => Writer): AgentWriter => ({
  base: () => w().current().base,
  files: () => {
    const c = w().current();
    return applyOverlay(c.base, c.overlay);
  },
  staged: () => Object.keys(w().current().overlay?.files ?? {}),
  stage: (p, t) => w().stage(p, t),
  commit: w().commit ? (m) => w().commit!(m) : null,
  problems: () => w().problems(),
});

/** The writer without React: the overlay, staging and the commit over a backend. useWriter wraps it. */
export function writerCore(
  backend: VaultBackend | null,
  rules: FileRules,
  base: () => VaultFile[],
  onWritten: (h: Head) => void,
  onOverlay: (o: Overlay | null) => void = () => undefined,
) {
  let overlay: Overlay | null = null;
  const change = async (o: Overlay | null) => {
    overlay = o && Object.keys(o.files).length ? o : null;
    onOverlay(overlay);
    await backend?.keep.set('overlay', overlay);
  };
  const written = (r: { head: Head; commit: string }) => {
    onWritten(r.head);
    return r.commit;
  };
  const write = backend?.write;
  const verify = gate(rules);
  return {
    get overlay() {
      return overlay;
    },
    async load() {
      overlay = (await backend?.keep.get<Overlay>('overlay')) ?? null;
      onOverlay(overlay);
    },
    /** Refused for a file no feature keeps, or deleting a file that doesn't exist: the same rules for the
     * editor and the agent. */
    async stage(path: string, text: string | null) {
      const o = overlay ?? { version: 0, files: {}, from: {} };
      const original = base().find((f) => f.path === path)?.text;
      if (text !== null && !rules.keeps(path))
        throw new Error(`${path} isn't a file the app keeps: ${rules.what}`);
      if (text === null && original === undefined && typeof o.files[path] !== 'string')
        throw new Error(`no such file: ${path}`);
      const files = { ...o.files };
      const from = { ...o.from };
      if (!(path in files)) from[path] = original === undefined ? null : await blobSha(original);
      if (text === original || (text === null && original === undefined)) {
        delete files[path];
        delete from[path];
      } else files[path] = text;
      await change({ version: o.version + 1, files, from });
    },
    async unstage(path: string) {
      if (!overlay) return;
      const { [path]: _, ...files } = overlay.files;
      const { [path]: __, ...from } = overlay.from;
      await change({ version: overlay.version + 1, files, from });
    },
    discard: () => change(null),
    commit: write
      ? async (message: string) => {
          const o = overlay;
          if (!o) throw new Error('nothing is staged');
          // A file changed on the vault since it was staged: committing would overwrite that change.
          const now = new Map(base().map((f) => [f.path, f.text]));
          const paths = Object.keys(o.from);
          const shas = await Promise.all(
            paths.map((p) => {
              const t = now.get(p);
              return t === undefined ? null : blobSha(t);
            }),
          );
          const stale = paths.filter((p, i) => shas[i] !== o.from[p]);
          if (stale.length) throw new Conflict(stale);
          const r = await write(
            Object.entries(o.files).map(([path, text]) => ({ path, text })),
            message,
            verify,
          );
          await change(null);
          return written(r);
        }
      : null,
    revert: backend?.revert
      ? async (sha: string) => written(await backend.revert!(sha, verify))
      : null,
    problems: () => rules.problems(base(), applyOverlay(base(), overlay)),
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
    core.load();
  }, [core]);
  return {
    base: base.current,
    overlay,
    stage: core.stage,
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
