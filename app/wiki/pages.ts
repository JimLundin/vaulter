import { reviewSupport, reviewSelection, passageSelection } from './reviews/reading.ts';
import { sameEntity, type EntityRef, type EntityDefinition } from '@/application/store/index.ts';
import {
  contentSelection,
  projectContentText,
  selectedText,
  type ContentValue,
} from './content.ts';
import {
  type readSelector,
  selectorReader,
  documentSources,
  type WikiDatabase,
  type SourceReading,
} from '@/wiki/reviews/selection.ts';
import type { WikiBlock, WikiPage, WikiReference } from '@/wiki/view.ts';

/** Native EAV reading. No storage translation or execution is triggered by opening Wiki. */
export async function readEavWiki(
  db: WikiDatabase,
  suppliedSources?: SourceReading,
): Promise<WikiPage[]> {
  const latest = await db.history.transactions.first({
    select: { committedAt: true },
    orderBy: [{ sequence: 'desc' }],
  });
  if (!latest) return [];
  const view = db.at(latest);
  const readSource = suppliedSources ?? documentSources(db);
  const sourceReadings = new Map<string, ReturnType<SourceReading>>();
  const sources: SourceReading = (address) => {
    const key = JSON.stringify(address);
    let reading = sourceReadings.get(key);
    if (!reading) {
      reading = readSource(address);
      sourceReadings.set(key, reading);
    }
    return reading;
  };
  const readSelection = selectorReader(db, sources);
  const selectorReadings = new Map<string, ReturnType<typeof readSelector>>();
  const selector = (selection: Parameters<typeof readSelector>[1]) => {
    const key = JSON.stringify(selection);
    let reading = selectorReadings.get(key);
    if (!reading) {
      reading = readSelection(selection);
      selectorReadings.set(key, reading);
    }
    return reading;
  };
  const [pages, content, appearances, reviews, passages, references] = await Promise.all([
    view.entities.wikiPages.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: { key: true, title: true, summary: true, aliases: true, available: true },
    }),
    view.entities.wikiContent.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: contentSelection,
    }),
    view.entities.wikiAppearances.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: { key: true, content: true, page: true, parent: true, order: true, available: true },
      orderBy: [{ order: 'asc' }, { key: 'asc' }],
    }),
    view.entities.reviews.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: reviewSelection,
    }),
    view.entities.reviewPassages.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: passageSelection,
    }),
    view.entities.wikiPageReferences.query({
      limit: null, // Wiki assembly joins complete content, appearances and evidence in one snapshot.
      select: { key: true, page: true, source: true },
    }),
  ]);
  const currentText = projectContentText(content, appearances);
  const sourceReference = async (
    id: string,
    address: WikiReference['address'],
    range?: { start: number; end: number },
    claim?: { start: number; end: number },
  ): Promise<WikiReference> => {
    if (!address) throw new Error('Reference address is unavailable');
    const { recorded, current } = await sources(address);
    if (!recorded.available) throw new Error('Historical evidence is unavailable');
    const resolved = await db.history.resolve(address);
    const transaction = await db.history.transactions.get(resolved.transaction, {
      select: { sequence: true },
    });
    return {
      id,
      address,
      title: recorded.title,
      context: recorded.text,
      currentText: current?.available ? current.text : undefined,
      text: range ? selectedText(recorded.text, range.start, range.end) : recorded.text,
      range,
      claim,
      date: recorded.date,
      author: recorded.attribution,
      href: recorded.href,
      state: !current?.available
        ? 'deleted'
        : current.text !== recorded.text
          ? 'newer'
          : 'original',
      sequence: transaction!.sequence,
    };
  };
  const support = reviewSupport(db, latest, reviews, passages, selector, sourceReference);
  const block = async (
    placement: (typeof appearances)[number],
    path: readonly ContentValue[],
    occurrence = placement.key,
  ): Promise<WikiBlock> => {
    const value = content.find((item) => sameEntity(item, placement.content));
    if (!value) throw new Error('Appearance target is unavailable');
    if (path.some((item) => sameEntity(item, value))) throw new Error('Recursive Wiki content');
    if (!value.available)
      return {
        id: occurrence,
        data: { kind: 'unavailable', text: 'Content unavailable.' },
        children: [],
        evidence: [],
      };
    const children = await Promise.all(
      appearances
        .filter((item) => item.available && item.parent && sameEntity(item.parent, value))
        .map((item) => block(item, [...path, value], `${occurrence}/${item.key}`)),
    );
    const text = currentText(value);
    const fragments: { entity: EntityRef<EntityDefinition>; text: string; offset: number }[] = [];
    if (['paragraph', 'heading', 'cell'].includes(value.kind)) {
      let offset = 0;
      for (const appearance of appearances.filter(
        (item) => item.available && item.parent && sameEntity(item.parent, value),
      )) {
        const child = content.find((item) => sameEntity(item, appearance.content));
        if (!child?.available) continue;
        const childText = currentText(child);
        fragments.push({ entity: child, text: childText, offset });
        offset += childText.length;
      }
    }
    const reviewed = await support(value, text, 'wiki-text-utf16-v1', fragments);
    const chartData =
      value.chartData && !Array.isArray(value.chartData) && typeof value.chartData === 'object'
        ? (value.chartData as Readonly<
            Record<string, import('@/application/store/index.ts').JsonValue>
          >)
        : undefined;
    const data: WikiBlock['data'] = {
      kind: value.kind === 'text' ? 'run' : value.kind,
      ...(value.text !== undefined && { text: value.text }),
      ...(value.marks && { marks: value.marks }),
      ...(value.ordered !== undefined && { ordered: value.ordered }),
      ...(value.language !== undefined && { language: value.language }),
      ...(value.alignment !== undefined && { align: value.alignment }),
      ...(chartData && {
        ...chartData,
        chart: value.chartType ?? 'line',
        title: value.chartTitle ?? '',
        ...(value.chartUnit && { unit: value.chartUnit }),
      }),
    };
    // Child-level evidence remains independently selectable without lending support to its siblings.
    return {
      id: occurrence,
      address: await db.history.reference(latest, value),
      data,
      children,
      href: value.targetPage ? `#/wiki/${encodeURIComponent(value.targetPage.key)}/` : value.href,
      evidence: reviewed.evidence,
      support: ['paragraph', 'text', 'link', 'code'].includes(value.kind)
        ? reviewed.state
        : undefined,
    };
  };
  return Promise.all(
    pages
      .filter((page) => page.available)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(async (page): Promise<WikiPage> => {
        const summary = await support(page, page.summary, 'wiki-summary-utf16-v1');
        const blocks = await Promise.all(
          appearances
            .filter((item) => item.available && item.page && sameEntity(item.page, page))
            .map((item) => block(item, [])),
        );
        const pageSources = await Promise.all(
          references
            .filter((item) => sameEntity(item.page, page))
            .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
            .map((item) => sourceReference(item.key, item.source)),
        );
        return {
          id: page.key,
          title: page.title,
          summary: page.summary,
          kind: 'page',
          updated: latest.committedAt.toISOString(),
          blocks,
          metadata: [],
          sources: pageSources,
          summarySupport: summary.state,
          summaryEvidence: summary.evidence,
          entry: {
            href: `/wiki/${encodeURIComponent(page.key)}/`,
            t: page.title,
            e: page.summary,
            a: [...page.aliases],
            k: 'page',
            g: [],
          },
        };
      }),
  );
}
