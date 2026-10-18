import { reviewAdmission } from './reviews/admission.ts';
import { z } from 'zod';
import {
  sameEntity,
  clear,
  type EntityRef,
  type Transaction,
  type TransactionContext,
} from '@/core/store/index.ts';
import type { Actor } from '@/modules/actors/index.ts';
import { contentInput, type ContentInput } from './content.ts';
import {
  documentSources,
  type WikiDatabase,
  type SourceReading,
  type SelectorInput,
} from '@/modules/wiki/reviews/selection.ts';
import type { wikiSchema, PageRef, ContentRef } from './records.ts';

const pageInput = z.strictObject({
  key: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string(),
  aliases: z.array(z.string().min(1)).default([]),
});
type PlacementInput = { page?: PageRef; parent?: ContentRef; order: string };

async function unique(tx: Transaction<typeof wikiSchema>, key: string) {
  if (!key.trim()) throw new Error('Wiki navigation key must be nonempty');
  const values = await Promise.all([
    tx.entities.wikiPages.first({ where: { key: { eq: key } }, select: {} }),
    tx.entities.wikiContent.first({ where: { key: { eq: key } }, select: {} }),
    tx.entities.wikiAppearances.first({ where: { key: { eq: key } }, select: {} }),
  ]);
  if (values.some(Boolean)) throw new Error('Wiki navigation key is already in use');
}

async function validatePlacement(
  tx: Transaction<typeof wikiSchema>,
  content: ContentRef,
  input: PlacementInput,
) {
  if (!!input.page === !!input.parent || !input.order.trim())
    throw new Error('An appearance needs one parent and an order');
  const child = await tx.entities.wikiContent.get(content, { select: { kind: true } });
  if (!child) throw new Error('Content is unavailable');
  if (
    input.page &&
    !(await tx.entities.wikiPages.get(input.page, { select: { available: true } }))?.available
  )
    throw new Error('Page is unavailable');
  if (input.parent) {
    const parent = await tx.entities.wikiContent.get(input.parent, {
      select: { available: true, kind: true },
    });
    if (!parent?.available) throw new Error('Parent content is unavailable');
    const allowed: Record<string, readonly string[]> = {
      section: [
        'embed',
        'heading',
        'section',
        'paragraph',
        'list',
        'quote',
        'table',
        'code',
        'chart',
        'rule',
      ],
      heading: ['text', 'link'],
      paragraph: ['text', 'link'],
      cell: ['text', 'link'],
      item: ['text', 'link', 'paragraph', 'list', 'quote', 'table', 'code', 'embed'],
      list: ['item'],
      table: ['row'],
      row: ['cell'],
      quote: ['section', 'paragraph', 'list', 'quote', 'table', 'code', 'chart', 'rule', 'embed'],
    };
    if (!allowed[parent.kind]?.includes(child.kind)) {
      // Check cycles before reporting structural incompatibility so failed moves remain explicit.
      if (sameEntity(input.parent, content)) throw new Error('Containment would be recursive');
      throw new Error(`${parent.kind} cannot contain ${child.kind}`);
    }
    const edges = await tx.entities.wikiAppearances.query({
      limit: null, // Containment admission must detect cycles across the complete appearance graph.
      select: { content: true, parent: true, available: true },
    });
    const pending = [content];
    const visited: ContentRef[] = [];
    while (pending.length) {
      const current = pending.pop()!;
      if (sameEntity(current, input.parent)) throw new Error('Containment would be recursive');
      if (visited.some((item) => sameEntity(item, current))) continue;
      visited.push(current);
      pending.push(
        ...edges
          .filter((edge) => edge.parent && sameEntity(edge.parent, current))
          .map((edge) => edge.content),
      );
    }
  }
}

/** Trusted attribution and atomic admission are shared by manual tooling and Agent producers. */
export function wikiActions(
  db: WikiDatabase,
  author: EntityRef<typeof Actor>,
  origin?: TransactionContext['origin'],
  suppliedSources?: SourceReading,
  signal?: AbortSignal,
) {
  const context = { author, ...(origin && { origin }) };
  const sources = suppliedSources ?? documentSources(db);
  const write = <T>(work: (tx: Transaction<typeof wikiSchema>) => Promise<T>) =>
    db.transaction(context, async (tx) => {
      signal?.throwIfAborted();
      const result = await work(tx);
      signal?.throwIfAborted();
      return result;
    });
  return {
    createPage: (input: z.input<typeof pageInput>) =>
      write(async (tx) => {
        const data = pageInput.parse(input);
        await unique(tx, data.key);
        return tx.entities.wikiPages.insert({ ...data, available: true, createdAt: new Date() });
      }),
    updatePage: (
      page: PageRef,
      input: { title?: string; summary?: string; aliases?: string[]; available?: boolean },
    ) =>
      write(async (tx) => {
        const current = await tx.entities.wikiPages.get(page, {
          select: { title: true, summary: true, aliases: true },
        });
        if (!current) throw new Error('Page is unavailable');
        const data = pageInput.parse({
          key: 'validation',
          title: input.title ?? current.title,
          summary: input.summary ?? current.summary,
          aliases: input.aliases ?? [...current.aliases],
        });
        await tx.entities.wikiPages.update({
          ...current,
          title: data.title,
          summary: data.summary,
          aliases: data.aliases,
          ...(input.available !== undefined && { available: input.available }),
        });
      }),
    append: (key: string, input: ContentInput, placement: PlacementInput) =>
      write(async (tx) => {
        const data = contentInput.parse(input);
        await unique(tx, key);
        await unique(tx, `${key}:appearance`);
        const content = await tx.entities.wikiContent.insert({ key, available: true, ...data });
        await validatePlacement(tx, content, placement);
        await tx.entities.wikiAppearances.insert({
          key: `${key}:appearance`,
          content,
          available: true,
          ...placement,
        });
        return content;
      }),
    share: (key: string, content: ContentRef, placement: PlacementInput) =>
      write(async (tx) => {
        await unique(tx, key);
        await validatePlacement(tx, content, placement);
        return tx.entities.wikiAppearances.insert({ key, content, available: true, ...placement });
      }),
    updateContent: (content: ContentRef, input: ContentInput) =>
      write(async (tx) => {
        const data = contentInput.parse(input);
        const current = await tx.entities.wikiContent.get(content, { select: { kind: true } });
        if (!current || current.kind !== data.kind) throw new Error('Content kind cannot change');
        await tx.entities.wikiContent.update({
          ...current,
          text: clear,
          marks: clear,
          ordered: clear,
          language: clear,
          alignment: clear,
          href: clear,
          chartType: clear,
          chartTitle: clear,
          chartUnit: clear,
          chartData: clear,
          embedMode: clear,
          embedTarget: clear,
          ...data,
        });
      }),
    removeContent: (content: ContentRef, available = false) =>
      write(async (tx) => {
        const current = await tx.entities.wikiContent.get(content, { select: {} });
        if (!current) throw new Error('Content is unavailable');
        await tx.entities.wikiContent.update({ ...current, available });
      }),
    move: (key: string, placement: PlacementInput) =>
      write(async (tx) => {
        const current = await tx.entities.wikiAppearances.first({
          where: { key: { eq: key } },
          select: { content: true },
        });
        if (!current) throw new Error('Appearance is unavailable');
        await validatePlacement(tx, current.content, placement);
        await tx.entities.wikiAppearances.update({
          ...current,
          page: clear,
          parent: clear,
          ...placement,
        });
      }),
    removeAppearance: (key: string, available = false) =>
      write(async (tx) => {
        const current = await tx.entities.wikiAppearances.first({
          where: { key: { eq: key } },
          select: {},
        });
        if (!current) throw new Error('Appearance is unavailable');
        await tx.entities.wikiAppearances.update({ ...current, available });
      }),
    review: reviewAdmission(db, author, sources, write),
    referencePage: async (key: string, page: PageRef, source: SelectorInput['target']) => {
      if (source.type.startsWith('wiki.'))
        throw new Error('Page provenance must refer to retained source material');
      await sources(source);
      return write(async (tx) => {
        if (!key.trim()) throw new Error('Page reference identity is required');
        if (!(await tx.entities.wikiPages.get(page, { select: { available: true } }))?.available)
          throw new Error('Page is unavailable');
        if (await tx.entities.wikiPageReferences.first({ where: { key: { eq: key } }, select: {} }))
          throw new Error('Page reference identity is already in use');
        return tx.entities.wikiPageReferences.insert({ key, page, source });
      });
    },
  };
}
