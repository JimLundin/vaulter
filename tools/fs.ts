// The vault from disk, for the CLIs. The browser has its own backends.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isVaultPath } from '../app/vault/documents/notes/note.ts';
import type { VaultFile } from '../app/vault/files.ts';

const paths = (root: string) =>
  ['', 'daily', 'captures', 'meta']
    .flatMap((d) => {
      try {
        return readdirSync(join(root, d)).map((f) => (d ? `${d}/${f}` : f));
      } catch {
        return [];
      }
    })
    .filter(isVaultPath);

/** The vault's folder: `--vault <dir>`, else the working directory. */
export const vaultArg = () => {
  const i = process.argv.indexOf('--vault');
  return i > 0 ? process.argv[i + 1] : '.';
};

/** Every page file under `root` as `{ path, text }`. */
export const readVaultFiles = (root: string): VaultFile[] =>
  paths(root).map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
