// The app's only way to a vault. The app knows nothing of git, GitHub or disks: a backend gives it the
// files, says when they changed, and writes a set of changes as one step. GitHub (backends/github) is
// one; the tests use an in-memory one (backends/memory). Keeping the app to this contract is what lets
// the frontend and the vault live apart.
import type { Change, VaultFile } from '../../core/vault.ts';
import type { History } from '../../core/audit.ts';

export type { Change } from '../../core/vault.ts';

/** The vault's files at one version (a tree sha, or anything that changes when the files do). */
export interface Head {
  files: VaultFile[];
  version: string;
}

/** Throws if `after` mustn't be written over `before` (the app passes the check, see core/writer.ts). */
export type Verify = (before: VaultFile[], after: VaultFile[]) => Promise<void>;

export interface Written {
  head: Head;
  commit: string;
}
export interface CommitSummary {
  sha: string;
  message: string;
  date: string;
}

export interface VaultBackend {
  /** The head as last kept on this device, if any: the app opens with it at once, offline too. */
  cached: () => Promise<Head | null>;
  /** The latest head, or null when it hasn't changed since the last one this backend returned. */
  refresh: () => Promise<Head | null>;
  /** Calls back when the vault changed outside this tab, with the new head when the backend has it at hand
   * (another tab wrote the cache), or without, meaning "refresh". Returns the unsubscribe. */
  watch: (onChange: (head?: Head) => void) => () => void;
  /** Writes the changes as one step after `verify` passes, verifying again if it has to rebuild them on a
   * newer head; a file changed meanwhile is a Conflict. Null for a read-only backend. */
  write: ((changes: Change[], message: string, verify: Verify) => Promise<Written>) | null;
  /** Steps written from the app, newest first; what a step changed; undoing one as a new step. */
  history: (() => Promise<CommitSummary[]>) | null;
  patch: ((sha: string) => Promise<{ filename: string; patch?: string }[]>) | null;
  revert: ((sha: string, verify: Verify) => Promise<Written>) | null;
  /** What changed since a day ("2026-09-25", from its start): the paths, and a file's text as it was then.
   * Absent where the backend keeps no history; the weekly audit (core/audit.ts) needs it. */
  since?: (day: string) => Promise<History>;
  /** Where a file can be seen at its source, if anywhere ("view on GitHub"). */
  source?: (path: string) => string;
  /** Small state the app keeps for this vault on this device (staged edits, worker results). */
  keep: {
    get: <T>(key: string) => Promise<T | null>;
    set: (key: string, value: unknown) => Promise<void>;
  };
}

export class CheckFailed extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`the check fails:\n${problems.join('\n')}`);
    this.problems = problems;
  }
}
export class Conflict extends Error {
  paths: string[];
  constructor(paths: string[], options?: ErrorOptions) {
    super(`changed meanwhile: ${paths.join(', ')}`, options);
    this.paths = paths;
  }
}
/** The network is down (as opposed to a backend error): the app says "offline" and keeps going from its cache. */
export class Offline extends Error {}

/** Marks a step as written from the app (by hand or by the agent); history() lists these. */
export const TRAILER = 'Committed-From: vault app';
