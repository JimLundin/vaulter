import type { OwnedVault } from '../../vault/index.ts';
import { renameNote as rewrite } from './rewrite.ts';

/** Stage a complete move and its reference rewrites as one overlay update. Committing is explicit. */
export async function renameNote(vault: OwnedVault, input: { from: string; to: string }) {
  await vault.update((files) => rewrite(files, input.from, input.to));
  return { staged: vault.staged() };
}
