import type { Vault } from '../../vault/index.ts';
import { renameNote as rewrite } from './rewrite.ts';

/** Stage a complete move and its reference rewrites as one overlay update. Committing is explicit. */
export async function renameNote(vault: Vault, input: { from: string; to: string }) {
  const changes = rewrite(vault.files(), input.from, input.to);
  await vault.stageMany(changes);
  return { staged: vault.staged() };
}
