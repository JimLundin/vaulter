// Revising the wiki from a note: a model reads the note with the pages it may be about and proposes
// pages to create, facts to add, summaries to rewrite, and questions where it isn't sure. Sure changes
// are made at once, citing the note; an unsure one becomes a question, and the answer makes it.

import { z } from 'zod';
import type { ChatV1 } from '#contracts/ai.chat';
import type { Note } from '#contracts/notes';
import type { QuestionsV1 } from '#contracts/questions';
import type { Page, Revised, WikiV1 } from '#contracts/wiki';
import { KINDS } from './pages.ts';

const FactIn = z.object({ text: z.string(), at: z.string().nullable() });
const Changes = z.object({
  create: z.array(
    z.object({
      /** A name for the new page within this answer ("new1"), to refer to it in summaries. */
      ref: z.string(),
      kind: z.enum(KINDS),
      name: z.string(),
      aliases: z.array(z.string()),
      facts: z.array(FactIn),
    }),
  ),
  add: z.array(z.object({ id: z.string(), facts: z.array(FactIn) })),
  summaries: z.array(z.object({ id: z.string(), summary: z.string() })),
});
const Plan = Changes.extend({
  ask: z.array(
    z.object({
      title: z.string(),
      body: z.string().nullable(),
      /** What to do on yes, and on no. */
      yes: Changes,
      no: Changes,
    }),
  ),
});
type Changes = z.infer<typeof Changes>;

const INSTRUCTIONS = `You keep a personal wiki from the notes a person speaks or types through the day.
Given a new note and the existing pages it may be about, return:
- create: pages for people, places, events and topics worth a page, with short facts from the note.
- add: short facts from the note for existing pages (by id). Each fact stands on its own, in the note's language.
- summaries: a new two to four sentence Markdown summary for each page whose facts changed (by id, or a create's ref).
- ask: a yes/no question, with what to do on each answer, wherever you are not sure: a name that may or may not be an existing page, a fact that contradicts one already known, a date you cannot place.
Never guess and never invent: only what the note says. A note with nothing to file returns empty lists.
The note is cited on every fact automatically; do not mention it.`;

const tokens = (s: string) =>
  s
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);

/** Pages the note may be about: a name or alias word in it, then the most recent, up to 60. */
function candidates(note: string, pages: Page[]): Page[] {
  const said = new Set(tokens(note));
  const named = pages.filter((p) =>
    [p.name, ...p.aliases].some((n) => tokens(n).some((w) => said.has(w))),
  );
  const recent = [...pages].sort((a, b) => b.updated.localeCompare(a.updated));
  return [...new Set([...named, ...recent])].slice(0, 60);
}

export interface ReviseDeps {
  wiki: Omit<WikiV1, 'revise'>;
  all: () => Promise<Page[]>;
  chat: ChatV1;
  questions: QuestionsV1;
}

type Cite = (f: z.infer<typeof FactIn>) => { text: string; sources: string[]; at?: string };

export function reviser(deps: ReviseDeps) {
  /** Each page the plan creates, with its facts: by the plan's own ref for it. */
  const create = async (changes: Changes, cite: Cite, rev: Revised) => {
    const made = new Map<string, Page>();
    for (const c of changes.create) {
      let e = await deps.wiki.create(c.kind, { name: c.name, aliases: c.aliases });
      for (const f of c.facts) e = await deps.wiki.addFact({ type: e.type, id: e.id }, cite(f));
      made.set(c.ref, e);
      rev.created.push({ type: e.type, id: e.id });
    }
    return made;
  };

  const apply = async (changes: Changes, note: Note, rev: Revised) => {
    const cite: Cite = (f) => ({ text: f.text, sources: [note.id], ...(f.at ? { at: f.at } : {}) });
    const made = await create(changes, cite, rev);
    const known = new Map((await deps.all()).map((e) => [e.id, e]));
    const refOf = (id: string) => {
      const e = made.get(id) ?? known.get(id);
      return e && { type: e.type, id: e.id };
    };
    for (const a of changes.add) {
      const ref = refOf(a.id);
      if (!ref) continue;
      for (const f of a.facts) await deps.wiki.addFact(ref, cite(f));
      rev.updated.push(ref);
    }
    for (const s of changes.summaries) {
      const ref = refOf(s.id);
      if (ref) await deps.wiki.update(ref, { summary: s.summary });
    }
  };

  return {
    async revise(note: Note): Promise<Revised> {
      const pages = candidates(note.text, await deps.all());
      const context = pages.map((p) => ({
        id: p.id,
        kind: p.kind,
        name: p.name,
        aliases: p.aliases,
        facts: p.facts.slice(-10).map((f) => f.text),
      }));
      const result = await deps.chat.complete({
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          {
            role: 'user',
            content: JSON.stringify({ note: { text: note.text, at: note.at }, pages: context }),
          },
        ],
        responseSchema: {
          name: 'revision',
          schema: z.toJSONSchema(Plan) as Record<string, unknown>,
        },
      });
      const plan = Plan.parse(JSON.parse(result.content ?? '{}'));
      const rev: Revised = { note: note.id, created: [], updated: [], asked: [] };
      await apply(plan, note, rev);
      for (const q of plan.ask) {
        const id = await deps.questions.ask({
          topic: 'revise',
          // Revising the same note again doesn't ask again what is still open.
          key: `${note.id}:${q.title}`,
          title: q.title,
          ...(q.body ? { body: q.body } : {}),
          choices: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
          notes: [note.id],
          data: {
            note: note as unknown as z.core.util.JSONType,
            yes: q.yes,
            no: q.no,
          } as z.core.util.JSONType,
        });
        rev.asked.push(id);
      }
      return rev;
    },

    /** Makes the change an answered question chose. */
    async answered(choice: string | undefined, data: unknown) {
      const d = data as { note: Note; yes: Changes; no: Changes };
      const changes = Changes.parse(choice === 'yes' ? d.yes : d.no);
      await apply(changes, d.note, { note: d.note.id, created: [], updated: [], asked: [] });
    },
  };
}
