// The wiki's API: what a person, Vaulter or another extension can do with it,
// each an operation of one input. Lists give pages in brief, and the rest the
// page. Merging pages and retracting a fact rewrite what is known.

import { z } from 'zod';
import { type Operation, operation } from '#core';
import { KINDS, NewPage, type Page, Patch } from './api.ts';
import * as pages from './pages.ts';

const Kind = z.enum(KINDS);

/** A page as a list gives it. */
function brief(page: Page) {
    const { id, kind, name, aliases, summary } = page;
    return { id, kind, name, aliases, summary };
}

export const wiki = {
    find: operation({
        description:
            'Find wiki pages (people, places, events, topics) by ' +
            'words in their name, aliases or summary, latest first.',
        input: z.object({
            query: z.string(),
            kinds: z.array(Kind).optional(),
        }),
        run: async ({ query, kinds }) =>
            (await pages.find(query, kinds)).map(brief),
    }),
    get: operation({
        description:
            'A wiki page with all its facts and the notes each comes from.',
        input: z.object({ id: z.string() }),
        run: ({ id }) => pages.get(id),
    }),
    citing: operation({
        description: 'The wiki pages that cite a note.',
        input: z.object({ noteId: z.string() }),
        run: async ({ noteId }) => (await pages.citing(noteId)).map(brief),
    }),
    create: operation({
        description:
            'Create a wiki page. Only for something the notes clearly ' +
            'mention.',
        input: NewPage.extend({ kind: Kind }),
        run: ({ kind, ...page }) => pages.create(kind, page),
    }),
    addFact: operation({
        description:
            'Add a fact to a page, citing the notes it comes from ' +
            '(at least one).',
        input: z.object({
            id: z.string(),
            text: z.string(),
            sources: z.array(z.string()).min(1),
            at: z.string().optional(),
        }),
        run: ({ id, ...fact }) => pages.addFact(id, fact),
    }),
    update: operation({
        description:
            "Change a page's name, aliases, summary, links, or its " +
            "kind's fields: a person's birthday, a place's area or " +
            "address, an event's date. Not its facts.",
        input: z.object({ id: z.string(), patch: Patch }),
        run: ({ id, patch }) => pages.update(id, patch),
    }),
    merge: operation({
        description:
            'Merge two pages about the same thing: `merge` is folded ' +
            'into `keep`, with its facts, aliases and links, and deleted.',
        rewrites: true,
        input: z.object({ keep: z.string(), merge: z.string() }),
        run: ({ keep, merge }) => pages.merge(keep, merge),
    }),
    retractFact: operation({
        description: 'Take a wrong fact off a page.',
        rewrites: true,
        input: z.object({ id: z.string(), factId: z.string() }),
        run: ({ id, factId }) => pages.retractFact(id, factId),
    }),
} satisfies Record<string, Operation>;
