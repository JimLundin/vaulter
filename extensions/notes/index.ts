// Notes: the append-only log of what was said or typed, kept as records. Voice appends here; the wiki
// reads it to build pages. Nothing here changes or removes a note: every page built from notes can be
// rebuilt from them.

import { z } from 'zod';
import type { Rec } from '#extensions/storage';
import { recordsFor } from '#extensions/storage';
import { NewNote, type Note, type Notes } from './api.ts';

export * from './api.ts';

const records = recordsFor('notes');
const fields = { ...NewNote.shape, at: z.iso.datetime() };
const note = await records.registerType('note', fields);
const listeners = new Set<(n: Note) => void>();
const toNote = ({ meta: _, ...n }: Rec<typeof fields>): Note => n;

export const notes: Notes = {
  async append(input) {
    const n = NewNote.parse(input);
    const out = toNote(await records.create(note, { ...n, at: n.at ?? new Date().toISOString() }));
    // After the note is kept, and apart from it: a listener that fails is its own error.
    for (const l of listeners) queueMicrotask(() => l(out));
    return out;
  },
  async get(id) {
    const rec = await records.get(note, id);
    return rec && toNote(rec);
  },
  // By when it was said, which for an import is not when it was stored.
  async list(q = {}) {
    const found = await records.query(note, {
      where: { at: { gte: q.since, lt: q.until } },
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
