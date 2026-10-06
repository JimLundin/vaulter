// The wiki: pages about people, places, events and topics, built from notes.
// Every fact cites the notes it came from, so a page can always be checked
// against what was said.

import { z } from 'zod';

export const KINDS = ['person', 'place', 'event', 'topic'] as const;
export type Kind = (typeof KINDS)[number];

const Fact = z.object({
    id: z.string(),
    text: z.string(),
    /** The notes it comes from. Never empty for a fact Vaulter added. */
    sources: z.array(z.string()),
    /** When it was true or happened, if it says. */
    at: z.string().optional(),
    added: z.string(),
});
export type Fact = z.infer<typeof Fact>;

/** What a page holds. Other pages are named by their ids. */
const PageFields = z.object({
    kind: z.enum(KINDS),
    name: z.string().trim().min(1),
    aliases: z.array(z.string()),
    /** A short summary in Markdown, kept up to date as facts are added. */
    summary: z.string(),
    facts: z.array(Fact),
    related: z.array(z.string()),
    /** A person's. */
    birthday: z.string().optional(),
    /** A place's. */
    area: z.string().optional(),
    address: z.string().optional(),
    geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
    /** An event's: a date or date-time, `until` for one that lasted, and
     * the place and people pages. */
    date: z.string().optional(),
    until: z.string().optional(),
    place: z.string().optional(),
    people: z.array(z.string()).optional(),
});
export type PageFields = z.infer<typeof PageFields>;

/** A page as it is kept. */
export const KeptPage = PageFields.extend({
    created: z.string(),
    updated: z.string(),
});
export type Page = z.infer<typeof KeptPage> & { id: string };

/** What a change to a page may set: anything but its kind and its facts. */
export const Patch = PageFields.omit({ kind: true, facts: true }).partial();
export type Patch = z.infer<typeof Patch>;

/** A new page: its name, and any of the other fields a change may set. */
export const NewPage = Patch.required({ name: true });
export type NewPage = z.infer<typeof NewPage>;
