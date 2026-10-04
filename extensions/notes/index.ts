// Notes: the append-only log of what was said or typed (notes@1), kept as records. Voice appends here;
// the wiki reads it to build pages. Nothing here changes or removes a note: every page built from notes
// can be rebuilt from them.
import { defineExtension } from '@pip/kernel';
import { NewNote, type Note, NoteSource, type NotesV1, notes } from '@contracts/notes';
import { records } from '@contracts/records';
import { z } from 'zod';

export default defineExtension({
  id: 'notes',
  version: '1.0.0',
  provides: { notes },
  requires: { records },
  agentGuide: 'The log of what the person said or typed, never changed. Cite a note by its id.',
  setup({ records }) {
    const note = records.registerType('note', {
      text: z.string(),
      source: NoteSource,
      at: z.iso.datetime(),
      context: z.record(z.string(), z.json()).optional(),
    });
    const listeners = new Set<(n: Note) => void>();
    const toNote = (r: Note): Note => ({
      id: r.id,
      text: r.text,
      source: r.source,
      at: r.at,
      ...(r.context === undefined ? {} : { context: r.context }),
    });

    const api: NotesV1 = {
      async append(input) {
        const n = NewNote.parse(input);
        const rec = await records.put(note, { ...n, at: n.at ?? new Date().toISOString() });
        const out = toNote(rec as Note);
        for (const l of listeners) void Promise.resolve(l(out)).catch(() => undefined);
        return out;
      },
      async get(id) {
        const rec = await records.get(note, id);
        return rec && toNote(rec as Note);
      },
      // By when it was said, which for an import is not when it was stored.
      async list(q = {}) {
        let all = (await records.query(note)).map((r) => toNote(r as Note));
        if (q.since) all = all.filter((n) => n.at >= q.since!);
        if (q.until) all = all.filter((n) => n.at < q.until!);
        all.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
        if (q.order !== 'oldest') all.reverse();
        return all.slice(0, q.limit);
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
