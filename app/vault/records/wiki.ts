// Wiki records: a page is a container of blocks; blocks that hold text contain inline nodes. Each kind
// is the props of its component. Unclaimed until the Wiki module exists (docs/specs/vault-records.md).
import { z } from 'zod';
import { localDate, text } from './common.ts';

export const page = z.strictObject({
  kind: z.literal('page'),
  title: text.max(200),
  summary: text.optional(),
  aliases: z.array(text).optional(),
  created: localDate.optional(),
  // Places' fields on a place page.
  geo: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      precision: z.literal('street').optional(),
    })
    .optional(),
  address: text.optional(),
});
const mark = z.enum(['strong', 'emphasis', 'code', 'strike']);
const marks = z.array(mark).min(1).optional();
/** A selection in a historical plain-text projection; offsets are half-open UTF-16 units. */
export const textSelection = z
  .strictObject({
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    start: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    end: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((range) => range.end > range.start, 'Selection must be nonempty');
export const citation = z.union([
  z.strictObject({ kind: z.literal('cite') }), // previously recorded whole-source citations
  z.strictObject({
    kind: z.literal('cite'),
    scope: z.literal('page'),
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }), // page provenance, never supporting evidence for a statement
  z.strictObject({
    kind: z.literal('cite'),
    unit: z.literal('utf16'),
    claim: textSelection,
    passage: textSelection,
  }),
]);
export const wikiSchemas = {
  page,
  section: z.strictObject({ kind: z.literal('section') }),
  heading: z.strictObject({ kind: z.literal('heading') }),
  paragraph: z.strictObject({ kind: z.literal('paragraph') }),
  list: z.strictObject({ kind: z.literal('list'), ordered: z.boolean() }),
  item: z.strictObject({ kind: z.literal('item') }),
  quote: z.strictObject({ kind: z.literal('quote') }),
  table: z.strictObject({ kind: z.literal('table') }),
  row: z.strictObject({ kind: z.literal('row') }),
  cell: z.strictObject({
    kind: z.literal('cell'),
    align: z.enum(['left', 'center', 'right']).optional(),
  }),
  code: z.strictObject({ kind: z.literal('code'), language: text.optional(), text: z.string() }),
  chart: z.strictObject({
    kind: z.literal('chart'),
    chart: z.enum(['line', 'bar']),
    title: text,
    unit: text.optional(),
    x: z.array(z.string()),
    series: z.array(z.strictObject({ name: text, values: z.array(z.number()) })),
  }),
  rule: z.strictObject({ kind: z.literal('rule') }),
  run: z.strictObject({ kind: z.literal('run'), text, marks }),
  link: z.strictObject({ kind: z.literal('link'), text, marks }),
  cite: citation,
} as const;

/** Which kinds a container may hold: the structure every page keeps. */
export const inline = new Set(['run', 'link', 'cite']);
export const blocks = new Set([
  'section',
  'paragraph',
  'list',
  'quote',
  'table',
  'code',
  'chart',
  'rule',
  'query',
  'timeline',
  'date',
  'task',
  'question',
  'decision',
  'relationship',
  'cite',
]);
/** An item holds its first paragraph's inline nodes, then any blocks: lists, paragraphs, code. */
const itemBlocks = new Set(['list', 'paragraph', 'quote', 'table', 'code']);
export const containment: Record<string, (kind: string, index: number) => boolean> = {
  page: (kind) => blocks.has(kind),
  section: (kind, index) => (index === 0 ? kind === 'heading' : blocks.has(kind)),
  heading: (kind) => inline.has(kind),
  paragraph: (kind) => inline.has(kind),
  item: (kind) => inline.has(kind) || itemBlocks.has(kind),
  run: (kind) => kind === 'cite',
  link: (kind) => kind === 'cite',
  code: (kind) => kind === 'cite',
  quote: (kind) => blocks.has(kind),
  cell: (kind) => inline.has(kind),
  list: (kind) => kind === 'item',
  table: (kind) => kind === 'row',
  row: (kind) => kind === 'cell',
};
