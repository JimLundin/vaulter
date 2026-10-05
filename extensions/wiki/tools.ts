// What Vaulter may do with the wiki. Looking things up and adding run on
// their own. Anything that rewrites what is known, such as merging pages or
// retracting a fact, asks the person first.

import { z } from 'zod';
import type { Tool } from '#extensions/agent';
import { KINDS, type Page, type Wiki } from './api.ts';

// What the model sends, checked before a tool runs.
const Kind = z.enum(KINDS);
const RecordRef = z.object({ type: z.string(), id: z.string() });
/** What a change may set: a page's own fields, never its facts. */
const Patch = z.object({
  name: z.string().trim().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  summary: z.string().optional(),
  related: z.array(RecordRef).optional(),
  birthday: z.string().optional(),
  area: z.string().optional(),
  address: z.string().optional(),
  date: z.string().optional(),
  until: z.string().optional(),
});

/** A tool as the list holds it, whatever its input. */
function tool<I>(definition: Tool<I>) {
  return definition as unknown as Tool<unknown>;
}

/** A page as the model sees it in a list. */
function brief(page: Page) {
  return {
    ref: { type: page.type, id: page.id },
    kind: page.kind,
    name: page.name,
    aliases: page.aliases,
    summary: page.summary,
  };
}

/** The tools the wiki gives Vaulter. */
export function toolsOf(wiki: Wiki): Tool<unknown>[] {
  return [
    tool({
      name: 'findPages',
      description:
        'Find wiki pages (people, places, events, topics) by words in ' +
        'their name, aliases or summary.',
      access: 'read',
      input: z.object({ query: z.string(), kinds: z.array(Kind).optional() }),
      run: async ({ query, kinds }) =>
        (await wiki.find(query, kinds)).map(brief),
    }),
    tool({
      name: 'getPage',
      description:
        'A wiki page with all its facts and the notes each comes from.',
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
      description:
        'Create a wiki page. Only for something the notes clearly mention.',
      access: 'write',
      input: z.object({
        kind: Kind,
        name: z.string().trim().min(1),
        aliases: z.array(z.string()).optional(),
      }),
      run: async ({ kind, ...page }) => brief(await wiki.create(kind, page)),
    }),
    tool({
      name: 'addFact',
      description:
        'Add a fact to a page, citing the notes it comes from (at least one).',
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
      description:
        "Change a page's name, aliases, summary, links, or its kind's " +
        "fields: a person's birthday, a place's area or address, an " +
        "event's date. Not its facts.",
      access: 'write',
      input: z.object({ ref: RecordRef, patch: Patch }),
      run: async ({ ref, patch }) => brief(await wiki.update(ref, patch)),
    }),
    tool({
      name: 'mergePages',
      description:
        'Merge two pages about the same thing; the person approves first.',
      access: 'ask',
      input: z.object({ keep: RecordRef, merge: RecordRef }),
      run: async ({ keep, merge }) => brief(await wiki.merge(keep, merge)),
    }),
    tool({
      name: 'retractFact',
      description: 'Take a wrong fact off a page; the person approves first.',
      access: 'ask',
      input: z.object({ ref: RecordRef, factId: z.string() }),
      run: async ({ ref, factId }) =>
        brief(await wiki.retractFact(ref, factId)),
    }),
  ];
}
