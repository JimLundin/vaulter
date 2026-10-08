// Notes: the vault's files as notes (model/): which files they are, the problems a change adds, the
// vocabulary, and the notes in search. No page of its own: reading a note is the reader's.
import type { Extension } from '../../core/extension.ts';
import { titleOf, excerptOf, hrefOf, kind, asList, topicsOf } from './model/fields.ts';
import { noteFiles } from './model/problems.ts';
import { schemaFor } from './model/schema.ts';
import { notesOf } from './model/notes.ts';

export const notes: Extension = {
  id: 'notes',
  // The vault's files: the notes and the vocabulary. A write that adds a problem to them is refused.
  files: noteFiles,
  // Without a readable vocabulary nothing can be shown as it is meant.
  blocked: (host) => {
    const s = schemaFor(host.files);
    return s instanceof Error ? s.message : null;
  },
  search: ({ files }) =>
    notesOf(files).notes.map((n) => ({
      href: hrefOf(n),
      t: titleOf(n),
      e: excerptOf(n),
      a: asList(n.data.aliases),
      k: kind(n.id),
      g: kind(n.id) === 'note' ? topicsOf(n) : [],
    })),
};
