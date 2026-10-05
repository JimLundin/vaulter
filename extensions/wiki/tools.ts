// What Vaulter may do with the wiki, as agent tools: looking things up is free, adding is logged, and
// anything that rewrites what is known (merging pages, retracting a fact) asks first.
import type { AgentToolsV1 } from '#contracts/agent.tools';
import { RecordRef } from '#contracts/records';
import { Kind, type WikiV1 } from '#contracts/wiki';
import { z } from 'zod';

const brief = (e: {
  id: string;
  type: string;
  kind: string;
  name: string;
  aliases: string[];
  summary: string;
}) => ({
  ref: { type: e.type, id: e.id },
  kind: e.kind,
  name: e.name,
  aliases: e.aliases,
  summary: e.summary,
});

export async function addTools(tools: AgentToolsV1, wiki: WikiV1) {
  const add = [
    tools.add({
      name: 'findPages',
      description:
        'Find wiki pages (people, places, events, topics) by words in their name, aliases or summary.',
      access: 'read',
      input: z.object({ query: z.string(), kinds: z.array(Kind).optional() }),
      run: async ({ query, kinds }) => (await wiki.find(query, kinds)).map(brief),
    }),
    tools.add({
      name: 'getPage',
      description: 'A wiki page with all its facts and the notes each comes from.',
      access: 'read',
      input: z.object({ ref: RecordRef }),
      run: ({ ref }) => wiki.get(ref),
    }),
    tools.add({
      name: 'pagesCiting',
      description: 'The wiki pages that cite a note.',
      access: 'read',
      input: z.object({ noteId: z.string() }),
      run: async ({ noteId }) => (await wiki.citing(noteId)).map(brief),
    }),
    tools.add({
      name: 'createPage',
      description: 'Create a wiki page. Only for something the notes clearly mention.',
      access: 'write',
      input: z.object({ kind: Kind, name: z.string(), aliases: z.array(z.string()).optional() }),
      run: async ({ kind, ...entity }) => brief(await wiki.create(kind, entity)),
    }),
    tools.add({
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
    tools.add({
      name: 'updatePage',
      description: "Change a page's name, aliases, summary or other fields (not its facts).",
      access: 'write',
      input: z.object({ ref: RecordRef, patch: z.record(z.string(), z.unknown()) }),
      run: async ({ ref, patch }) => brief(await wiki.update(ref, patch)),
    }),
    tools.add({
      name: 'mergePages',
      description: 'Merge two pages about the same thing; the person approves first.',
      access: 'ask',
      input: z.object({ keep: RecordRef, merge: RecordRef }),
      run: async ({ keep, merge }) => brief(await wiki.merge(keep, merge)),
    }),
    tools.add({
      name: 'retractFact',
      description: 'Take a wrong fact off a page; the person approves first.',
      access: 'ask',
      input: z.object({ ref: RecordRef, factId: z.string() }),
      run: async ({ ref, factId }) => brief(await wiki.retractFact(ref, factId)),
    }),
  ];
  await Promise.all(add);
}
