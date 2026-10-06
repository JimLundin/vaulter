// Questions: how Vaulter and other extensions ask the person when something
// is unclear, or before a change they aren't sure of. Each choice holds what
// choosing it does: a call of an operation, kept as data.

import { z } from 'zod';
import { Call } from '#core';
import type { Rec } from '#extensions/storage';

/** Something the person can pick, and the call picking it makes, if any. */
const Choice = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    does: Call.optional(),
});

/** A question as an extension asks it. */
export const NewQuestion = z.object({
    /** The extension asking. */
    from: z.string().min(1),
    title: z.string().min(1).max(200),
    body: z.string().max(4000).optional(),
    choices: z.array(Choice).min(1),
    /** The notes it came from. */
    notes: z.array(z.string()).default([]),
    /** Asking again with the same key, while one is open, returns that one. */
    key: z.string().optional(),
});

/** A question as it is kept. */
export const KeptQuestion = NewQuestion.extend({
    at: z.string(),
    status: z.enum(['open', 'answered']),
    /** The id of the choice the person made. */
    choice: z.string().optional(),
});
export type Question = Rec<z.output<typeof KeptQuestion>>;

/** The choices of a yes-or-no question: yes makes `onYes`, and no makes
 * `onNo`, if there is one. */
export function yesNo(onYes: Call, onNo?: Call) {
    return [
        { id: 'yes', label: 'Yes', does: onYes },
        { id: 'no', label: 'No', does: onNo },
    ];
}
