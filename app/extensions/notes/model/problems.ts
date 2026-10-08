// The vault's files as notes keeps them (extension.ts `files`): which they are, and the problems a change
// adds, by the check (check.ts) before and after. The check (and the MDX parser it needs) loads on first use.
import type { VaultFile } from '../../../core/files.ts';
import { isVaultPath } from './note.ts';

export async function newProblems(before: VaultFile[], after: VaultFile[]): Promise<string[]> {
  const { checkVault } = await import('./check.ts');
  const old = new Set(checkVault(before).problems);
  return checkVault(after).problems.filter((p) => !old.has(p));
}

export const noteFiles = {
  keeps: isVaultPath,
  what: 'notes at the root (.md, .mdx), daily/, captures/, meta/ (.md), meta/schema.yaml',
  problems: newProblems,
};
