// Standalone source-note and graph checks used by the private Vault’s CI.
import type { VaultFile } from '../files.ts';
import { checkNotes } from './notes.ts';
import { checkGraph } from './graph.ts';

export function checkVault(files: VaultFile[]): { problems: string[]; ok: number; files: number } {
  const n = checkNotes(files);
  const g = checkGraph(files);
  return { problems: [...n.problems, ...g.problems], ok: g.ok, files: n.files };
}
