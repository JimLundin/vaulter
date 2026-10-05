// Revising the wiki from a note. The model reads the note with the pages it
// may be about, and proposes pages, facts and summaries. What it is sure of
// is made at once, citing the note. What it isn't sure of becomes a
// question, and the answer makes it.

import { z } from 'zod';
import type { Note } from '#extensions/notes';
import { model } from '#extensions/openai';
import { questionsFor, YES_NO } from '#extensions/questions';
import { words } from '#extensions/storage';
import { KINDS, type Page, type Revised } from './api.ts';
import { addFact, all, create, get, update } from './pages.ts';
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
const Pending = z.object({ note: z.string(), yes: Changes, no: Changes });

/** How many pages the model is shown with a note. */
const MAX_PAGES = 60;
const questions = questionsFor('wiki');

/** The words of `text` that can name something. */
function naming(text: string) {
    return words(text).filter((word) => word.length >= 3);
}

/** The pages a note may be about: those with a name or alias word in it,
 * then the most recent. */
function candidates(note: string, every: Page[]): Page[] {
    const said = new Set(naming(note));
    const named = every.filter((page) =>
        [page.name, ...page.aliases].some((name) =>
            naming(name).some((word) => said.has(word)),
        ),
    );
    const recent = [...every].sort((a, b) =>
        b.meta.updated.localeCompare(a.meta.updated),
    );
    return [...new Set([...named, ...recent])].slice(0, MAX_PAGES);
}

/** A fact from the model, citing `noteId`. */
function cited(fact: FactIn, noteId: string) {
    return { text: fact.text, sources: [noteId], at: fact.at ?? undefined };
}

/** Makes `changes`, citing `noteId`. The model names a page by its id, or
 * by its ref in this answer, and a page it names that isn't there is left
 * out. Returns the pages created and updated. */
async function apply(changes: Changes, noteId: string) {
    const made = new Map<string, string>();
    const created: string[] = [];
    for (const { ref, kind, name, aliases, facts } of changes.create) {
        const page = await create(kind, { name, aliases });
        for (const fact of facts) {
            await addFact(page.id, cited(fact, noteId));
        }
        made.set(ref, page.id);
        created.push(page.id);
    }
    async function pageId(named: string) {
        const id = made.get(named) ?? named;
        return (await get(id)) && id;
    }

    const updated: string[] = [];
    for (const add of changes.add) {
        const id = await pageId(add.id);
        if (!id) {
            continue;
        }
        for (const fact of add.facts) {
            await addFact(id, cited(fact, noteId));
        }
        updated.push(id);
    }
    for (const { id: named, summary } of changes.summaries) {
        const id = await pageId(named);
        if (id) {
            await update(id, { summary });
        }
    }
    return { created, updated };
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
    const { created, updated } = await apply(plan, note.id);

    const asked: string[] = [];
    for (const unsure of plan.ask) {
        const id = await questions.ask({
            topic: 'revise',
            // Revising the same note again doesn't ask again what is still
            // open.
            key: `${note.id}:${unsure.title}`,
            title: unsure.title,
            body: unsure.body ?? undefined,
            choices: YES_NO,
            notes: [note.id],
            data: { note: note.id, yes: unsure.yes, no: unsure.no },
        });
        asked.push(id);
    }
    return { note: note.id, created, updated, asked };
}

/** Makes the change an answered question chose. */
export async function answered(choice: string | undefined, data: unknown) {
    const pending = Pending.parse(data);
    await apply(choice === 'yes' ? pending.yes : pending.no, pending.note);
}
