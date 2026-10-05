// What Vaulter may do with the wiki, as agent tools: looking things up and adding run on their own, and
// anything that rewrites what is known (merging pages, retracting a fact) asks first.

import { z } from 'zod';
import { type Tool, tool } from '#contracts/agent.tools';
import { RecordRef } from '#contracts/records';
import { Kind, type Page, type WikiV1 } from '#contracts/wiki';

const brief = (e: Page) => ({
  ref: { type: e.type, id: e.id },
  kind: e.kind,
  name: e.name,
  aliases: e.aliases,
  summary: e.summary,
});

/** The tools the wiki gives Vaulter. */
export const toolsOf = (wiki: WikiV1): Tool<unknown>[] => [
  tool({
    name: 'findPages',
    description:
      'Find wiki pages (people, places, events, topics) by words in their name, aliases or summary.',
    access: 'read',
    input: z.object({ query: z.string(), kinds: z.array(Kind).optional() }),
    run: async ({ query, kinds }) => (await wiki.find(query, kinds)).map(brief),
  }),
  tool({
    name: 'getPage',
    description: 'A wiki page with all its facts and the notes each comes from.',
    access: 'read',
    input: z.object({ ref: RecordRef }),
    run: ({ ref }) => wiki.get(ref),
  }),
  tool({
    name: 'pagesCiting',
    description: 'The wiki pages that cite a note.',
    access: 'read',
    input: z.object({ noteId: z.string() }),
    run: async ({ noteId }) => (await wiki.citing(noteId)).map(brief),
  }),
  tool({
    name: 'createPage',
    description: 'Create a wiki page. Only for something the notes clearly mention.',
    access: 'write',
    input: z.object({ kind: Kind, name: z.string(), aliases: z.array(z.string()).optional() }),
    run: async ({ kind, ...page }) => brief(await wiki.create(kind, page)),
  }),
  tool({
    name: 'addFact',
    description: 'Add a fact to a page, citing the notes it comes from (at least one).',
    access: 'write',
    input: z.object({
      ref: RecordRef,
      text: z.string(),
      sources: z.array(z.string()).min(1),
      at: z.string().optional(),
    }),
    run: async ({ ref, ...fact }) => brief(await wiki.addFact(ref, fact)),
  }),
  tool({
    name: 'updatePage',
    description: "Change a page's name, aliases, summary or other fields (not its facts).",
    access: 'write',
    input: z.object({ ref: RecordRef, patch: z.record(z.string(), z.unknown()) }),
    run: async ({ ref, patch }) => brief(await wiki.update(ref, patch)),
  }),
  tool({
    name: 'mergePages',
    description: 'Merge two pages about the same thing; the person approves first.',
    access: 'ask',
    input: z.object({ keep: RecordRef, merge: RecordRef }),
    run: async ({ keep, merge }) => brief(await wiki.merge(keep, merge)),
  }),
  tool({
    name: 'retractFact',
    description: 'Take a wrong fact off a page; the person approves first.',
    access: 'ask',
    input: z.object({ ref: RecordRef, factId: z.string() }),
    run: async ({ ref, factId }) => brief(await wiki.retractFact(ref, factId)),
  }),
];
