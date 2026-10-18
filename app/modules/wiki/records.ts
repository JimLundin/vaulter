import { e, type EntityRef } from '@/core/store/index.ts';
import { Actor } from '@/modules/actors/index.ts';
import { sourceEntities } from '@/modules/sources/index.ts';
import { evidenceEntities } from '@/modules/wiki/reviews/records.ts';

/** A page can serve as a subject without receiving a second Subject identity. */
export const WikiPage = e.entity('wiki.page', {
  key: e.string(),
  title: e.string(),
  summary: e.string(),
  aliases: e.set(e.string()),
  available: e.boolean(),
  createdAt: e.datetime(),
});
export const Content = e.entity('wiki.content', {
  key: e.string(),
  kind: e.enum(
    'section',
    'heading',
    'paragraph',
    'list',
    'item',
    'quote',
    'table',
    'row',
    'cell',
    'code',
    'chart',
    'rule',
    'text',
    'link',
    'embed',
  ),
  available: e.boolean(),
  text: e.string().optional(),
  marks: e.set(e.enum('strong', 'emphasis', 'code', 'strike')).optional(),
  ordered: e.boolean().optional(),
  language: e.string().optional(),
  alignment: e.enum('left', 'center', 'right').optional(),
  href: e.string().optional(),
  targetPage: e.ref(WikiPage).optional(),
  chartType: e.enum('line', 'bar').optional(),
  chartTitle: e.string().optional(),
  chartUnit: e.string().optional(),
  chartData: e.json().optional(),
  embedMode: e.enum('live', 'pinned').optional(),
  embedTarget: e.historicalRef().optional(),
});
/** Repeated/shared content has one identity and independently ordered appearances. */
export const Appearance = e.entity('wiki.appearance', {
  key: e.string(),
  content: e.ref(Content),
  page: e.ref(WikiPage).optional(),
  parent: e.ref(Content).optional(),
  order: e.string(),
  available: e.boolean(),
});
export const PageReference = e.entity('wiki.pageReference', {
  key: e.string(),
  page: e.ref(WikiPage),
  source: e.historicalRef(),
});
export const wikiEntities = {
  wikiPages: WikiPage,
  wikiContent: Content,
  wikiAppearances: Appearance,
  wikiPageReferences: PageReference,
} as const;
export const wikiSchema = e.registry({
  actors: Actor,
  ...sourceEntities,
  ...evidenceEntities,
  ...wikiEntities,
});
export type PageRef = EntityRef<typeof WikiPage>;
export type ContentRef = EntityRef<typeof Content>;
