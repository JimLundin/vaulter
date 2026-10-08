import type { Change, VaultFile } from '../files.ts';
import type { VaultBackend } from '../storage/backend.ts';

export interface WriteOptions {
  /** A sequence must explicitly include existing edits, or refuse to start with them. */
  staged: 'include' | 'reject' | Change[];
  signal?: AbortSignal;
}

export interface OwnedVault {
  files: () => VaultFile[];
  base: () => VaultFile[];
  staged: () => string[];
  stage: (path: string, text: string | null) => Promise<void>;
  stageMany: (changes: Change[]) => Promise<void>;
  /** Read, calculate and stage while owning the vault. */
  update: (calculate: (files: VaultFile[]) => Change[] | Promise<Change[]>) => Promise<void>;
  commit: ((message: string) => Promise<string>) | null;
  revert: ((sha: string) => Promise<string>) | null;
  history: VaultBackend['history'];
  patch: VaultBackend['patch'];
  problems: () => Promise<string[]>;
}

export interface Vault extends OwnedVault {
  /** Own the vault for the callback's lifetime. Use the supplied vault for every nested operation.
   * Its handle expires on completion or cancellation. Failed sequences retain their staged edits. */
  write: <T>(operation: (vault: OwnedVault) => Promise<T>, options: WriteOptions) => Promise<T>;
}

export class StagedChanges extends Error {
  readonly paths: string[];
  constructor(paths: string[]) {
    super(`Review the staged changes before starting: ${paths.join(', ')}`);
    this.paths = paths;
  }
}
