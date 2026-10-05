// The wiki: curated pages about people, places, events and topics, built from notes. Every fact cites
// the notes it came from, so a page can always be checked against what was said, and rebuilt from it.
// Each kind is a record type of the wiki's, kept through records@1.

import { z } from 'zod';
import { RecordRef } from '#contracts/records';
import { defineContract } from '#kernel';

export const Kind = z.enum(['person', 'place', 'event', 'topic']);
export type Kind = z.infer<typeof Kind>;

export const Fact = z.object({
  id: z.string(),
  text: z.string().min(1),
  /** The notes it comes from: never empty for a fact Vaulter added. */
  sources: z.array(z.string()),
  /** When it was true or happened, if it says. */
  at: z.string().optional(),
  added: z.iso.datetime(),
});
export type Fact = z.infer<typeof Fact>;

/** The fields every kind has. */
export const common = {
  name: z.string().trim().min(1),
  aliases: z.array(z.string()).default([]),
  /** A short summary in Markdown, kept up to date as facts are added. */
  summary: z.string().default(''),
  facts: z.array(Fact).default([]),
  related: z.array(RecordRef).default([]),
};

/** Each kind's own fields, besides `common`. */
export const fields = {
  person: { ...common, birthday: z.string().optional() },
  place: {
    ...common,
    area: z.string().optional(),
    address: z.string().optional(),
    geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
  },
  event: {
    ...common,
    /** A date or date-time; `until` for one that lasted. */
    date: z.string().optional(),
    until: z.string().optional(),
    place: RecordRef.optional(),
    people: z.array(RecordRef).default([]),
  },
  topic: { ...common },
};

export interface Entity {
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

export interface Revision {
  note: string;
  created: RecordRef[];
  updated: RecordRef[];
  /** Questions asked instead of changes it wasn't sure of. */
  asked: string[];
}

/** A new page: its name, and any of its kind's other fields. */
export interface NewEntity {
  name: string;
  aliases?: string[];
  summary?: string;
  [field: string]: unknown;
}

export interface WikiV1 {
  /** Pages whose name, aliases or summary contain every word of `text`. */
  find: (text: string, kinds?: Kind[]) => Promise<Entity[]>;
  get: (ref: RecordRef) => Promise<Entity | undefined>;
  create: (kind: Kind, entity: NewEntity) => Promise<Entity>;
  /** Changes fields other than facts. */
  update: (ref: RecordRef, patch: Record<string, unknown>) => Promise<Entity>;
  addFact: (
    ref: RecordRef,
    fact: { text: string; sources: string[]; at?: string },
  ) => Promise<Entity>;
  retractFact: (ref: RecordRef, factId: string) => Promise<Entity>;
  /** Folds `merge` into `keep`: facts, aliases and links together; `merge` then reads as `keep`. */
  merge: (keep: RecordRef, merge: RecordRef) => Promise<Entity>;
  /** The pages that cite a note. */
  citing: (noteId: string) => Promise<Entity[]>;
  /** Revises the pages a note touches (as happens on its own when a note is appended, with a model). */
  revise: (noteId: string) => Promise<Revision>;
}

export const wiki = defineContract<WikiV1>({
  name: 'wiki',
  version: 1,
});
