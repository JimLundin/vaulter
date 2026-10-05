// Notes: the append-only log of what was said or typed (notes@1), kept as records. Voice appends here;
// the wiki reads it to build pages. Nothing here changes or removes a note: every page built from notes
// can be rebuilt from them.

import { z } from 'zod';
import { NewNote, type Note, NoteSource, type NotesV1, notes } from '#contracts/notes';
import { type Rec, records } from '#contracts/records';
import { defineExtension } from '#kernel';

export default defineExtension({
  id: 'notes',
  version: '1.0.0',
  provides: { notes },
  requires: { records },
  agentGuide: 'The log of what the person said or typed, never changed. Cite a note by its id.',
  async setup({ records }) {
    const fields = {
      text: z.string(),
      source: NoteSource,
      at: z.iso.datetime(),
      context: z.record(z.string(), z.json()).optional(),
    };
    const note = await records.registerType('note', fields);
    const listeners = new Set<(n: Note) => void>();
    const toNote = ({ meta: _, ...n }: Rec<typeof fields>): Note => n as Note;

    const api: NotesV1 = {
      async append(input) {
        const n = NewNote.parse(input);
        const out = toNote(
          await records.create(note, { ...n, at: n.at ?? new Date().toISOString() }),
        );
        for (const l of listeners) void Promise.resolve(l(out)).catch(() => undefined);
        return out;
      },
      async get(id) {
        const rec = await records.get(note, id);
        return rec && toNote(rec);
      },
      // By when it was said, which for an import is not when it was stored.
      async list(q = {}) {
        const at = { gte: q.since, lt: q.until };
        const found = await records.query(note, {
          where: q.since || q.until ? { at } : {},
          orderBy: 'at',
          order: q.order === 'oldest' ? 'asc' : 'desc',
          limit: q.limit,
        });
        return found.map(toNote);
      },
      onAppended(handler) {
        listeners.add(handler);
        return Promise.resolve(() => {
          listeners.delete(handler);
        });
      },
    };
    return { notes: api };
  },
});
