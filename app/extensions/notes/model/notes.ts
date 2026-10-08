// The notes of the files, once per files: every page parsed (note.ts), and found by id or by href.
import type { VaultFile } from '../../../core/files.ts';
import { loadNotes } from './note.ts';
import { hrefOf, type Note } from './fields.ts';

export interface Notes {
  notes: Note[];
  byId: Map<string, Note>;
  /** Site href ("/janne/") -> note: what a route points at. */
  byHref: Map<string, Note>;
}

const cache = new WeakMap<VaultFile[], Notes>();
export function notesOf(files: VaultFile[]): Notes {
  let n = cache.get(files);
  if (!n) {
    const notes = loadNotes(files);
    n = {
      notes,
      byId: new Map(notes.map((x) => [x.id, x])),
      byHref: new Map(notes.map((x) => [hrefOf(x), x])),
    };
    cache.set(files, n);
  }
  return n;
}
