// Notes: the append-only log of what was said or typed. Voice appends to
// it, and the wiki builds its pages from it. A note is never changed or
// removed, so everything built from notes can be rebuilt from them.

import { z } from 'zod';
import { collection, type Rec } from '#extensions/storage';
import type { Unsubscribe } from '#kernel';

/** A note as a person or an import gives it. */
export const NewNote = z.object({
    text: z.string().trim().min(1),
    source: z.enum(['typed', 'voice', 'import']).default('typed'),
    /** When it was said: now, or earlier for an import. */
    at: z.iso.datetime().default(() => new Date().toISOString()),
    /** What was around it, such as where, or the audio's id. */
    context: z.record(z.string(), z.json()).optional(),
});

export type Note = Rec<z.output<typeof NewNote>>;

const kept = collection<z.output<typeof NewNote>>('notes/note');
const listeners = new Set<(note: Note) => void>();

export const notes = {
    async append(input: z.input<typeof NewNote>) {
        const note = await kept.create(NewNote.parse(input));
        // Each listener runs on its own, after the note is kept, so one that
        // fails can't undo or stop anything.
        for (const listener of listeners) {
            queueMicrotask(() => listener(note));
        }
        return note;
    },

    get(id: string) {
        return kept.get(id);
    },

    /** By when each was said, which for an import is not when it was kept:
     * at or after `since`, and before `until`. */
    list(
        query: {
            since?: string;
            until?: string;
            limit?: number;
            order?: 'newest' | 'oldest';
        } = {},
    ) {
        return kept.query({
            where: { at: { gte: query.since, lt: query.until } },
            orderBy: 'at',
            order: query.order === 'oldest' ? 'asc' : 'desc',
            limit: query.limit,
        });
    },

    onAppended(listener: (note: Note) => void): Unsubscribe {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
