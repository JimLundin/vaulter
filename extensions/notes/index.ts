// Notes: the append-only log of what was said or typed. Voice appends to
// it, and the wiki builds its pages from it. A note is never changed or
// removed.

import { z } from 'zod';
import { type Extension, type Operation, operation } from '#core';
import { collection, type Rec } from '#extensions/storage';

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

const kept = collection('notes/note', NewNote, ['at']);
const listeners = new Set<(note: Note) => void>();

const operations = {
    append: operation({
        description:
            'Keep a note: something the person said or typed, in their ' +
            "own words, never words of Vaulter's.",
        input: NewNote,
        run: async (note) => {
            const appended = await kept.create(note);
            // Each listener runs on its own, after the note is kept, so one
            // that fails can't undo or stop anything.
            for (const listener of listeners) {
                queueMicrotask(() => listener(appended));
            }
            return appended;
        },
    }),
    get: operation({
        description: 'A note, as it was said.',
        input: z.object({ id: z.string() }),
        run: ({ id }) => kept.get({ id }),
    }),
    list: operation({
        description:
            'Notes by when each was said, which for an import is not when ' +
            'it was kept: at or after `since`, and before `until`, newest ' +
            'first unless `order` is "oldest".',
        input: z.object({
            since: z.iso.datetime().optional(),
            until: z.iso.datetime().optional(),
            limit: z.number().int().positive().optional(),
            order: z.enum(['newest', 'oldest']).optional(),
        }),
        run: ({ since, until, limit, order }) =>
            kept.query({
                where: { at: { gte: since, lt: until } },
                orderBy: 'at',
                order: order === 'oldest' ? 'asc' : 'desc',
                limit,
            }),
    }),
} satisfies Record<string, Operation>;

export const notes = {
    ...operations,
    // Not offered: what it takes is code, a listener.
    onAppended: operation({
        description:
            'Hears of every note appended, after it is kept. Returns what ' +
            'stops it.',
        input: z.object({
            listener: z.custom<(note: Note) => void>(
                (value) => typeof value === 'function',
            ),
        }),
        run: ({ listener }) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    }),
} satisfies Record<string, Operation>;

export const extension = { operations } satisfies Extension;
