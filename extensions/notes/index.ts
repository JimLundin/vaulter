// Notes: the append-only log of what was said or typed. Voice appends to
// it, and the wiki builds its pages from it.

import { collection, type Rec } from '#extensions/storage';
import { omit } from '#kernel';
import { NewNote, type Note, type Notes } from './api.ts';

export * from './api.ts';

type Kept = Omit<Note, 'id'>;

const kept = collection<Kept>('notes/note');
const listeners = new Set<(note: Note) => void>();

function noteOf(record: Rec<Kept>): Note {
  return omit(record, 'meta');
}

export const notes: Notes = {
  async append(input) {
    const given = NewNote.parse(input);
    const at = given.at ?? new Date().toISOString();
    const note = noteOf(await kept.create({ ...given, at }));
    // Each listener runs on its own, after the note is kept, so one that
    // fails can't undo or stop anything.
    for (const listener of listeners) {
      queueMicrotask(() => listener(note));
    }
    return note;
  },

  async get(id) {
    const record = await kept.get(id);
    return record && noteOf(record);
  },

  async list(query = {}) {
    const found = await kept.query({
      where: { at: { gte: query.since, lt: query.until } },
      orderBy: 'at',
      order: query.order === 'oldest' ? 'asc' : 'desc',
      limit: query.limit,
    });
    return found.map(noteOf);
  },

  onAppended(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
