// The wiki's pages, in one collection, each fact kept on its page with the
// notes it came from. What the model sends is checked by the tools and the
// reviser before it gets here.

import { collection } from '#extensions/storage';
import type { Fact, Kind, NewPage, Page, PageFields, Patch } from './api.ts';

const kept = collection<PageFields>('wiki/page');

/** Every page, of every kind. */
export function all() {
    return kept.query();
}

/** Pages whose name, aliases or summary contain every word of `text`,
 * latest first. */
export async function find(text: string, kinds?: Kind[]) {
    const found = await kept.search(text, {
        fields: ['name', 'aliases', 'summary'],
    });
    return found.filter((page) => !kinds || kinds.includes(page.kind));
}

export function get(id: string) {
    return kept.get(id);
}

export function create(kind: Kind, page: NewPage) {
    // What a page isn't given, it starts without.
    return kept.create({
        aliases: [],
        summary: '',
        related: [],
        ...page,
        kind,
        name: page.name.trim(),
        facts: [],
    });
}

/** Changes fields other than facts. */
export function update(id: string, patch: Patch) {
    return kept.update(id, (page) => ({ ...page, ...patch }));
}

export function addFact(
    id: string,
    fact: { text: string; sources: string[]; at?: string },
) {
    const added: Fact = {
        ...fact,
        id: crypto.randomUUID(),
        added: new Date().toISOString(),
    };
    return kept.update(id, (page) => ({
        ...page,
        facts: [...page.facts, added],
    }));
}

export function retractFact(id: string, factId: string) {
    return kept.update(id, (page) => ({
        ...page,
        facts: page.facts.filter((fact) => fact.id !== factId),
    }));
}

/** `keep`, with `gone`'s names, facts and links folded in, and its other
 * fields where `keep` has none. */
function folded(keep: Page, gone: Page): PageFields {
    const factIds = new Set(keep.facts.map((fact) => fact.id));
    const names = new Set([...keep.aliases, gone.name, ...gone.aliases]);
    const links = new Set([...keep.related, ...gone.related]);
    links.delete(keep.id);
    links.delete(gone.id);
    return {
        ...gone,
        ...keep,
        aliases: [...names].filter((name) => name !== keep.name),
        facts: [
            ...keep.facts,
            ...gone.facts.filter((fact) => !factIds.has(fact.id)),
        ],
        related: [...links],
    };
}

function linksOf(page: Page) {
    return [...page.related, ...(page.people ?? []), page.place];
}

/** `page`, with its links to `from` going to `to`. */
function relinked(page: Page, from: string, to: string): PageFields {
    function swap(id: string) {
        return id === from ? to : id;
    }
    return {
        ...page,
        related: [...new Set(page.related.map(swap))],
        place: page.place && swap(page.place),
        people: page.people && [...new Set(page.people.map(swap))],
    };
}

/** Folds `goneId` into `keepId`, with its facts, aliases and links. The
 * page `goneId` is then deleted, and what pointed at it points at
 * `keepId`. */
export async function merge(keepId: string, goneId: string) {
    const gone = await get(goneId);
    if (!gone) {
        throw new Error(`no page ${goneId}`);
    }
    const merged = await kept.update(keepId, (keep) => {
        if (keep.kind !== gone.kind) {
            throw new Error('only pages of the same kind can be merged');
        }
        return folded(keep, gone);
    });
    await kept.delete(goneId);

    for (const page of await all()) {
        if (linksOf(page).includes(goneId)) {
            await kept.update(page.id, (now) => relinked(now, goneId, keepId));
        }
    }
    return merged;
}

/** The pages that cite a note. */
export async function citing(noteId: string) {
    const every = await all();
    return every.filter((page) =>
        page.facts.some((fact) => fact.sources.includes(noteId)),
    );
}
