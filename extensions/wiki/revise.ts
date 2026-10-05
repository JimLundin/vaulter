// Revising the wiki from a note. The model reads the note with the pages it
// may be about, and proposes pages, facts and summaries. What it is sure of
// is made at once, citing the note. What it isn't sure of becomes a
// question, and the answer makes it.

import { z } from 'zod';
import type { Note } from '#extensions/notes';
import { model } from '#extensions/openai';
import { questionsFor } from '#extensions/questions';
import type { RecordRef } from '#extensions/storage';
import { KINDS, type Page, type Revised } from './api.ts';
import { all, pages } from './pages.ts';
import instructions from './revise.md?raw';

// What the model answers, checked before anything is made of it.
const FactIn = z.object({ text: z.string(), at: z.string().nullable() });
const Changes = z.object({
  create: z.array(
    z.object({
      /** A name for the new page within this answer ("new1"), so the
       * summaries can refer to it. */
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
type FactIn = z.infer<typeof FactIn>;

/** What an unsure change's question holds, to make the change once it is
 * answered. */
interface Pending {
  note: Note;
  yes: Changes;
  no: Changes;
}

/** How many pages the model is shown with a note. */
const MAX_PAGES = 60;
const questions = questionsFor('wiki');

function tokens(text: string) {
  return text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
}

/** The pages a note may be about: those with a name or alias word in it,
 * then the most recent. */
function candidates(note: string, every: Page[]): Page[] {
  const said = new Set(tokens(note));
  const named = every.filter((page) =>
    [page.name, ...page.aliases].some((name) =>
      tokens(name).some((word) => said.has(word)),
    ),
  );
  const recent = [...every].sort((a, b) => b.updated.localeCompare(a.updated));
  return [...new Set([...named, ...recent])].slice(0, MAX_PAGES);
}

/** A fact from the model, citing `note`. */
function cited(fact: FactIn, note: Note) {
  return {
    text: fact.text,
    sources: [note.id],
    ...(fact.at ? { at: fact.at } : {}),
  };
}

/** Makes the pages `changes` creates. Returns them by the plan's own ref
 * for each. */
async function createPages(changes: Changes, note: Note, revised: Revised) {
  const made = new Map<string, Page>();
  for (const create of changes.create) {
    let page = await pages.create(create.kind, {
      name: create.name,
      aliases: create.aliases,
    });
    for (const fact of create.facts) {
      page = await pages.addFact(
        { type: page.type, id: page.id },
        cited(fact, note),
      );
    }
    made.set(create.ref, page);
    revised.created.push({ type: page.type, id: page.id });
  }
  return made;
}

/** Makes `changes`, citing `note`. */
async function apply(changes: Changes, note: Note, revised: Revised) {
  const made = await createPages(changes, note, revised);
  const known = new Map((await all()).map((page) => [page.id, page]));
  // The model names a page by its id, or by its ref in this answer.
  function refOf(id: string): RecordRef | undefined {
    const page = made.get(id) ?? known.get(id);
    return page && { type: page.type, id: page.id };
  }

  for (const add of changes.add) {
    const ref = refOf(add.id);
    if (!ref) {
      continue;
    }
    for (const fact of add.facts) {
      await pages.addFact(ref, cited(fact, note));
    }
    revised.updated.push(ref);
  }
  for (const { id, summary } of changes.summaries) {
    const ref = refOf(id);
    if (ref) {
      await pages.update(ref, { summary });
    }
  }
}

/** What the model is shown of each page. */
function shown(page: Page) {
  return {
    id: page.id,
    kind: page.kind,
    name: page.name,
    aliases: page.aliases,
    facts: page.facts.slice(-10).map((fact) => fact.text),
  };
}

/** Revises the pages `note` touches. */
export async function revise(note: Note): Promise<Revised> {
  const plan = await model.json({
    instructions,
    input: {
      note: { text: note.text, at: note.at },
      pages: candidates(note.text, await all()).map(shown),
    },
    schema: Plan,
    name: 'revision',
  });
  const revised: Revised = {
    note: note.id,
    created: [],
    updated: [],
    asked: [],
  };
  await apply(plan, note, revised);

  for (const unsure of plan.ask) {
    const pending: Pending = { note, yes: unsure.yes, no: unsure.no };
    const id = await questions.ask({
      topic: 'revise',
      // Revising the same note again doesn't ask again what is still open.
      key: `${note.id}:${unsure.title}`,
      title: unsure.title,
      ...(unsure.body ? { body: unsure.body } : {}),
      choices: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      notes: [note.id],
      data: pending as never,
    });
    revised.asked.push(id);
  }
  return revised;
}

/** Makes the change an answered question chose. */
export async function answered(choice: string | undefined, data: unknown) {
  const pending = data as Pending;
  const changes = Changes.parse(choice === 'yes' ? pending.yes : pending.no);
  await apply(changes, pending.note, {
    note: pending.note.id,
    created: [],
    updated: [],
    asked: [],
  });
}
