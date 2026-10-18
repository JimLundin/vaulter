import type { EntityRef, DomainDatabase, HistoricalReference } from '@/core/store/index.ts';
import { Content, WikiPage, type wikiSchema } from '@/modules/wiki/records.ts';
import { contentSelection, projectContentText, selectedText } from '@/modules/wiki/content.ts';

export type { SourceProjection, SourceReading } from '@/modules/sources/index.ts';
import type { SourceReading } from '@/modules/sources/index.ts';
export { documentSources } from '@/modules/sources/index.ts';
export type WikiDatabase = DomainDatabase<typeof wikiSchema>;
export type SelectorInput = {
  target: HistoricalReference;
  format: 'wiki-text-utf16-v1' | 'wiki-summary-utf16-v1' | 'source-text-utf16-v1';
  start: number;
  end: number;
};

export function selectorReader(db: WikiDatabase, sources: SourceReading) {
  const projections = new Map<string, Promise<ReturnType<typeof projectContentText>>>();
  return async (selection: SelectorInput) => {
    const resolved = await db.history.resolve(selection.target);
    const view = db.at(resolved.transaction);
    let context: string;
    if (selection.format === 'wiki-summary-utf16-v1') {
      if (selection.target.type !== WikiPage.name)
        throw new Error('Summary selection requires a Wiki page');
      const page = await view.entities.wikiPages.get(
        resolved.entity as EntityRef<typeof WikiPage>,
        { select: { summary: true, available: true } },
      );
      if (!page?.available) throw new Error('Selected page is unavailable');
      context = page.summary;
    } else if (selection.format === 'wiki-text-utf16-v1') {
      if (selection.target.type !== Content.name)
        throw new Error('Wiki text selection requires Wiki content');
      const content = await view.entities.wikiContent.get(
        resolved.entity as EntityRef<typeof Content>,
        { select: { available: true } },
      );
      if (!content?.available) throw new Error('Selected content is unavailable');
      let projection = projections.get(selection.target.transaction);
      if (!projection) {
        projection = Promise.all([
          view.entities.wikiContent.query({
            limit: null, // Historical selection projection must preserve complete content and appearances.
            select: contentSelection,
          }),
          view.entities.wikiAppearances.query({
            limit: null, // Historical selection projection must preserve complete content and appearances.
            select: { content: true, parent: true, order: true, key: true, available: true },
            orderBy: [{ order: 'asc' }, { key: 'asc' }],
          }),
        ]).then(([contents, placements]) => projectContentText(contents, placements));
        projections.set(selection.target.transaction, projection);
      }
      context = (await projection)(content);
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
  };
}

export function readSelector(db: WikiDatabase, selection: SelectorInput, sources: SourceReading) {
  return selectorReader(db, sources)(selection);
}
