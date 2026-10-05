// Questions: how Vaulter asks the person when something is unclear, or a
// change it isn't sure of. An extension asks under a topic of its own, and
// handles the answers under that topic, also after a restart.

import { z } from 'zod';
import type { Rec } from '#extensions/storage';

/** A question as an extension asks it. */
export const NewQuestion = z.object({
    /** The asker's own topic, such as "merge-people". */
    topic: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1).max(200),
    body: z.string().max(4000).optional(),
    /** What the person can pick. With none, the answer is text. */
    choices: z
        .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
        .optional(),
    /** The notes it came from. */
    notes: z.array(z.string()).default([]),
    /** Asking again with the same key, while one is open, returns that one. */
    key: z.string().optional(),
    /** Anything the asker needs back with the answer. It comes back from
     * storage, perhaps to a newer version of the asker, so the asker reads
     * it with a schema of its own. */
    data: z.unknown().optional(),
});

/** The person's answer: one of the choices, or text. */
export const Answer = z
    .object({ choice: z.string().optional(), text: z.string().optional() })
    .refine((a) => a.choice !== undefined || a.text !== undefined, {
        message: 'a choice or text',
    });
export type Answer = z.infer<typeof Answer>;

export type Question = Rec<
    z.output<typeof NewQuestion> & {
        /** The extension that asked. */
        from: string;
        at: string;
        status: 'open' | 'answered';
        answer?: Answer;
        /** Whether the asker has had its answer. */
        delivered: boolean;
    }
>;

export type Handler = (answer: Answer, question: Question) => unknown;

/** The choices of a yes-or-no question. */
export const YES_NO = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
];
