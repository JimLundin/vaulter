// The vault's files as notes keeps them (extension.ts `files`): which they are, and the problems a change
// adds, by the notes' check (check.ts) before and after. The check (and the Markdown parser it needs) loads on first use.
import type { VaultFile } from '../files.ts';
import { isVaultPath } from '../documents/notes/note.ts';

export async function newProblems(before: VaultFile[], after: VaultFile[]): Promise<string[]> {
  const { checkNotes } = await import('./notes.ts');
  const old = new Set(checkNotes(before).problems);
  return checkNotes(after).problems.filter((p) => !old.has(p));
}

export const noteFiles = {
  keeps: isVaultPath,
  what: 'notes at the root (.md), daily/, captures/, meta/ (.md), meta/schema.yaml',
  problems: newProblems,
};
