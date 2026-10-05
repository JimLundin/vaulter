// The wiki's pages, one collection per kind, each fact kept on its page
// with the notes it came from. What the model sends is checked by the
// tools and the reviser before it gets here.

import {
  type Collection,
  collection,
  type Rec,
  type RecordRef,
} from '#extensions/storage';
import { omit } from '#kernel';
import { KINDS, type Kind, type Page, type Wiki } from './api.ts';

type Fields = Record<string, unknown>;

const kept = Object.fromEntries(
  KINDS.map((kind) => [kind, collection<Fields>(`wiki/${kind}`)]),
) as Record<Kind, Collection<Fields>>;

function kindOf(ref: RecordRef): Kind {
  const kind = KINDS.find((candidate) => kept[candidate].name === ref.type);
  if (!kind) {
    throw new Error(`${ref.type} is not a wiki type`);
  }
  return kind;
}

function pageOf(record: Rec<Fields>): Page {
  const { meta } = record;
  return {
    ...omit(record, 'meta'),
    type: meta.collection,
    kind: kindOf({ type: meta.collection, id: record.id }),
    created: meta.created,
    updated: meta.updated,
  } as Page;
}

function refOf(page: Page): RecordRef {
  return { type: page.type, id: page.id };
}

function same(a: RecordRef, b: RecordRef) {
  return a.type === b.type && a.id === b.id;
}

/** Every page, of every kind. */
export async function all() {
  const found = await Promise.all(KINDS.map((kind) => kept[kind].query()));
  return found.flat().map(pageOf);
}

async function get(ref: RecordRef) {
  const record = await kept[kindOf(ref)].get(ref.id);
  return record && pageOf(record);
}

async function must(ref: RecordRef) {
  const page = await get(ref);
  if (!page) {
    throw new Error(`no page ${ref.type}:${ref.id}`);
  }
  return page;
}

/** Changes a page with `change`, which gets it as it is now, so a change
 * made meanwhile isn't lost. */
async function change(ref: RecordRef, change: (page: Page) => Partial<Page>) {
  const record = await kept[kindOf(ref)].update(ref.id, (current) => {
    const page = pageOf(current);
    const changed = { ...page, ...change(page) };
    // What storage keeps itself, and what the page's collection says.
    return omit(changed, 'id', 'type', 'kind', 'created', 'updated');
  });
  return pageOf(record);
}

/** `keep`, with `merge`'s names, facts and links folded in. */
function folded(keep: Page, merge: Page, keepRef: RecordRef): Partial<Page> {
  const factIds = new Set(keep.facts.map((fact) => fact.id));
  const names = new Set([...keep.aliases, merge.name, ...merge.aliases]);
  const links = [...keep.related, ...merge.related];
  return {
    ...merge,
    ...keep,
    aliases: [...names].filter((name) => name !== keep.name),
    facts: [
      ...keep.facts,
      ...merge.facts.filter((fact) => !factIds.has(fact.id)),
    ],
    related: links.filter(
      (link, i) =>
        !same(link, keepRef) &&
        links.findIndex((other) => same(other, link)) === i,
    ),
  };
}

/** A page's links, with `from` replaced by `to`. */
function relinked(page: Page, from: RecordRef, to: RecordRef): Partial<Page> {
  const swap = (link: unknown) =>
    link && same(link as RecordRef, from) ? to : link;
  const links: Partial<Page> = {
    related: page.related.map((link) => swap(link) as RecordRef),
  };
  if (page.kind === 'event') {
    links.place = swap(page.place);
    links.people = (page.people as RecordRef[]).map(
      (link) => swap(link) as RecordRef,
    );
  }
  return links;
}

export const pages: Omit<Wiki, 'revise'> = {
  async find(text, kinds = [...KINDS]) {
    const fields = ['name', 'aliases', 'summary'];
    const found = await Promise.all(
      kinds.map((kind) => kept[kind].search(text, { fields })),
    );
    return found
      .flat()
      .sort((a, b) => b.meta.created.localeCompare(a.meta.created))
      .map(pageOf);
  },

  get,

  async create(kind, input) {
    // What a page isn't given, it starts without.
    const record = await kept[kind].create({
      aliases: [],
      summary: '',
      facts: [],
      related: [],
      ...(kind === 'event' ? { people: [] } : {}),
      ...input,
      name: input.name.trim(),
    });
    return pageOf(record);
  },

  update(ref, patch) {
    const fields = omit(patch as Partial<Page>, 'facts');
    return change(ref, () => fields);
  },

  addFact(ref, fact) {
    const added = {
      id: crypto.randomUUID(),
      added: new Date().toISOString(),
      ...fact,
    };
    return change(ref, (page) => ({ facts: [...page.facts, added] }));
  },

  retractFact(ref, factId) {
    return change(ref, (page) => ({
      facts: page.facts.filter((fact) => fact.id !== factId),
    }));
  },

  async merge(keepRef, mergeRef) {
    if (keepRef.type !== mergeRef.type) {
      throw new Error('only pages of the same kind can be merged');
    }
    const merge = await must(mergeRef);
    const merged = await change(keepRef, (keep) =>
      folded(keep, merge, keepRef),
    );
    await kept[kindOf(mergeRef)].delete(mergeRef.id);

    // What pointed at the merged page now points at the one kept.
    for (const page of await all()) {
      if (page.id === keepRef.id) {
        continue;
      }
      const links = relinked(page, mergeRef, keepRef);
      if (JSON.stringify({ ...page, ...links }) !== JSON.stringify(page)) {
        await change(refOf(page), () => links);
      }
    }
    return merged;
  },

  async citing(noteId) {
    const every = await all();
    return every.filter((page) =>
      page.facts.some((fact) => fact.sources.includes(noteId)),
    );
  },
};
