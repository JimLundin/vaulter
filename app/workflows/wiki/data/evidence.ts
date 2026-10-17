import { sameEntity, type DomainDatabase, type HistoricalReference } from '@/vault/eav/index.ts';
import { Content, WikiPage, type wikiSchema } from './schema.ts';
import { contentText, selectedText } from './content.ts';

export interface SourceProjection {
  readonly title: string;
  readonly text: string;
  readonly attribution?: string;
  readonly date?: string;
  readonly href?: string;
  readonly available: boolean;
}
/** Application supplies native source owners. Wiki content can never supply source evidence. */
export type SourceReading = (
  address: HistoricalReference,
) => Promise<{ recorded: SourceProjection; current?: SourceProjection }>;
export type WikiDatabase = DomainDatabase<typeof wikiSchema>;
export type SelectorInput = {
  target: HistoricalReference;
  format: 'wiki-text-utf16-v1' | 'wiki-summary-utf16-v1' | 'source-text-utf16-v1';
  start: number;
  end: number;
};

export function documentSources(db: WikiDatabase): SourceReading {
  return async (address) => {
    const resolved = await db.history.resolve(address);
    if (address.type !== 'source.document')
      throw new Error('The selected record is not an eligible source document');
    const past = db.at(resolved.transaction);
    const original = (
      await past.entities.sourceDocuments.query({
        select: {
          key: true,
          title: true,
          text: true,
          attribution: true,
          origin: true,
          occurredAt: true,
          available: true,
        },
      })
    ).find((item) => sameEntity(item, resolved.entity));
    if (!original?.available)
      throw new Error('Source material is unavailable in its selected snapshot');
    const current = await db.entities.sourceDocuments.get(original, {
      select: {
        title: true,
        text: true,
        attribution: true,
        origin: true,
        occurredAt: true,
        available: true,
      },
    });
    const describe = (value: NonNullable<typeof current>): SourceProjection => ({
      title: value.title,
      text: value.text,
      attribution: value.attribution,
      href: value.origin || undefined,
      date: value.occurredAt,
      available: value.available,
    });
    return { recorded: describe(original), current: current && describe(current) };
  };
}

export async function readSelector(
  db: WikiDatabase,
  selection: SelectorInput,
  sources: SourceReading,
) {
  const resolved = await db.history.resolve(selection.target);
  const view = db.at(resolved.transaction);
  let context: string;
  if (selection.format === 'wiki-summary-utf16-v1') {
    if (selection.target.type !== WikiPage.name)
      throw new Error('Summary selection requires a Wiki page');
    const page = (
      await view.entities.wikiPages.query({ select: { summary: true, available: true } })
    ).find((item) => sameEntity(item, resolved.entity));
    if (!page?.available) throw new Error('Selected page is unavailable');
    context = page.summary;
  } else if (selection.format === 'wiki-text-utf16-v1') {
    if (selection.target.type !== Content.name)
      throw new Error('Wiki text selection requires Wiki content');
    const content = (await view.entities.wikiContent.query({ select: { available: true } })).find(
      (item) => sameEntity(item, resolved.entity),
    );
    if (!content?.available) throw new Error('Selected content is unavailable');
    context = await contentText(view, content);
  } else {
    if (selection.target.type === Content.name || selection.target.type === WikiPage.name)
      throw new Error('Wiki content is distilled knowledge and cannot support a citation');
    const source = await sources(selection.target);
    if (!source.recorded.available) throw new Error('Selected source is unavailable');
    context = source.recorded.text;
  }
  return {
    context,
    text: selectedText(context, selection.start, selection.end),
    entity: resolved.entity,
  };
}
