// The vault's check, every feature's together: the notes' (each file as a note) and the graph's (links and
// fields resolve). What CI runs (tools/check.ts) and what the tests hold the whole vault to; in the app
// each feature gates a write with its own (`files.problems`).
import type { VaultFile } from '../files.ts';
import { checkNotes } from './notes.ts';
import { checkGraph } from './graph.ts';

export function checkVault(files: VaultFile[]): { problems: string[]; ok: number; files: number } {
  const n = checkNotes(files);
  const g = checkGraph(files);
  return { problems: [...n.problems, ...g.problems], ok: g.ok, files: n.files };
}
