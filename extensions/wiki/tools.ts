// What Vaulter may do with the wiki. Looking things up and adding run on
// their own. Anything that rewrites what is known, such as merging pages or
// retracting a fact, asks the person first.

import { z } from 'zod';
import type { Tool } from '#extensions/agent';
import { KINDS, NewPage, type Page, Patch } from './api.ts';
import * as pages from './pages.ts';

/** A tool, with its input's type taken from its schema. */
function tool<Input extends z.ZodType>(definition: Tool<Input>) {
    return definition;
}

/** A page as the model sees it in a list. */
function brief(page: Page) {
    const { id, kind, name, aliases, summary } = page;
    return { id, kind, name, aliases, summary };
}

const Kind = z.enum(KINDS);

/** The tools the wiki gives Vaulter. */
export const tools: Tool[] = [
    tool({
        name: 'findPages',
        description:
            'Find wiki pages (people, places, events, topics) by ' +
            'words in their name, aliases or summary.',
        access: 'read',
        input: z.object({
            query: z.string(),
            kinds: z.array(Kind).optional(),
        }),
        run: async ({ query, kinds }) =>
            (await pages.find(query, kinds)).map(brief),
    }),
    tool({
        name: 'getPage',
        description:
            'A wiki page with all its facts and the notes each comes from.',
        access: 'read',
        input: z.object({ id: z.string() }),
        run: ({ id }) => pages.get(id),
    }),
    tool({
        name: 'pagesCiting',
        description: 'The wiki pages that cite a note.',
        access: 'read',
        input: z.object({ noteId: z.string() }),
        run: async ({ noteId }) => (await pages.citing(noteId)).map(brief),
    }),
    tool({
        name: 'createPage',
        description:
            'Create a wiki page. Only for something the notes clearly ' +
            'mention.',
        access: 'write',
        input: NewPage.extend({ kind: Kind }),
        run: async ({ kind, ...page }) => brief(await pages.create(kind, page)),
    }),
    tool({
        name: 'addFact',
        description:
            'Add a fact to a page, citing the notes it comes from ' +
            '(at least one).',
        access: 'write',
        input: z.object({
            id: z.string(),
            text: z.string(),
            sources: z.array(z.string()).min(1),
            at: z.string().optional(),
        }),
        run: async ({ id, ...fact }) => brief(await pages.addFact(id, fact)),
    }),
    tool({
        name: 'updatePage',
        description:
            "Change a page's name, aliases, summary, links, or its " +
            "kind's fields: a person's birthday, a place's area or " +
            "address, an event's date. Not its facts.",
        access: 'write',
        input: z.object({ id: z.string(), patch: Patch }),
        run: async ({ id, patch }) => brief(await pages.update(id, patch)),
    }),
    tool({
        name: 'mergePages',
        description:
            'Merge two pages about the same thing; the person approves ' +
            'first.',
        access: 'ask',
        input: z.object({ keep: z.string(), merge: z.string() }),
        run: async ({ keep, merge }) => brief(await pages.merge(keep, merge)),
    }),
    tool({
        name: 'retractFact',
        description: 'Take a wrong fact off a page; the person approves first.',
        access: 'ask',
        input: z.object({ id: z.string(), factId: z.string() }),
        run: async ({ id, factId }) =>
            brief(await pages.retractFact(id, factId)),
    }),
];
