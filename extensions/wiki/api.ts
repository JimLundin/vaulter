// The wiki: pages about people, places, events and topics, built from notes.
// Every fact cites the notes it came from, so a page can always be checked
// against what was said, and rebuilt from it.

import type { RecordRef } from '#extensions/storage';

export const KINDS = ['person', 'place', 'event', 'topic'] as const;
export type Kind = (typeof KINDS)[number];

export interface Fact {
    id: string;
    text: string;
    /** The notes it comes from. Never empty for a fact Vaulter added. */
    sources: string[];
    /** When it was true or happened, if it says. */
    at?: string;
    added: string;
}

/** What every kind has. */
export interface Common {
    name: string;
    aliases: string[];
    /** A short summary in Markdown, kept up to date as facts are added. */
    summary: string;
    facts: Fact[];
    related: RecordRef[];
}

/** What each kind holds. */
export interface Fields {
    person: Common & { birthday?: string };
    place: Common & {
        area?: string;
        address?: string;
        geo?: { lat: number; lon: number };
    };
    /** A date or date-time; `until` for one that lasted. */
    event: Common & {
        date?: string;
        until?: string;
        place?: RecordRef;
        people: RecordRef[];
    };
    topic: Common;
}

export interface Page {
    id: string;
    type: string;
    kind: Kind;
    name: string;
    aliases: string[];
    summary: string;
    facts: Fact[];
    related: RecordRef[];
    created: string;
    updated: string;
    [field: string]: unknown;
}

/** What revising the wiki from a note did. */
export interface Revised {
    note: string;
    created: RecordRef[];
    updated: RecordRef[];
    /** Questions asked instead of changes it wasn't sure of. */
    asked: string[];
}

/** A new page: its name, and any of its kind's other fields. */
export interface NewPage {
    name: string;
    aliases?: string[];
    summary?: string;
    [field: string]: unknown;
}

/** What a change to a page may set: anything but its facts and what
 * storage keeps. */
export type PagePatch = Partial<
    Omit<Page, 'id' | 'type' | 'kind' | 'created' | 'updated' | 'facts'>
>;

export interface Wiki {
    /** Pages whose name, aliases or summary contain every word of `text`. */
    find: (text: string, kinds?: Kind[]) => Promise<Page[]>;
    get: (ref: RecordRef) => Promise<Page | undefined>;
    create: (kind: Kind, page: NewPage) => Promise<Page>;
    /** Changes fields other than facts. */
    update: (ref: RecordRef, patch: PagePatch) => Promise<Page>;
    addFact: (
        ref: RecordRef,
        fact: { text: string; sources: string[]; at?: string },
    ) => Promise<Page>;
    retractFact: (ref: RecordRef, factId: string) => Promise<Page>;
    /** Folds `merge` into `keep`, with its facts, aliases and links. `merge`
     * is then deleted, and what pointed at it points at `keep`. */
    merge: (keep: RecordRef, merge: RecordRef) => Promise<Page>;
    /** The pages that cite a note. */
    citing: (noteId: string) => Promise<Page[]>;
    /** Revises the pages a note touches, as happens on its own when a note
     * is appended. */
    revise: (noteId: string) => Promise<Revised>;
}
