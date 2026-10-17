import { z } from 'zod';
import { sameEntity, type ReadView, type Selected } from '@/vault/eav/index.ts';
import type { Content, wikiSchema, ContentRef } from './schema.ts';

export const contentSelection = {
  key: true,
  kind: true,
  available: true,
  text: true,
  marks: true,
  ordered: true,
  language: true,
  alignment: true,
  href: true,
  targetPage: { key: true },
  chartType: true,
  chartTitle: true,
  chartUnit: true,
  chartData: true,
} as const;
export type ContentValue = Selected<typeof Content, typeof contentSelection>;
const marks = z.enum(['strong', 'emphasis', 'code', 'strike']);
export const contentInput = z
  .strictObject({
    kind: z.enum([
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
    ]),
    text: z.string().optional(),
    marks: z.array(marks).optional(),
    ordered: z.boolean().optional(),
    language: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
    href: z.string().optional(),
    chartType: z.enum(['line', 'bar']).optional(),
    chartTitle: z.string().optional(),
    chartUnit: z.string().optional(),
    chartData: z
      .strictObject({
        x: z.array(z.string()),
        series: z.array(z.strictObject({ name: z.string(), values: z.array(z.number().finite()) })),
      })
      .optional(),
  })
  .superRefine((data, context) => {
    if (['text', 'link', 'code'].includes(data.kind) && data.text === undefined)
      context.addIssue({ code: 'custom', message: 'Text content requires text' });
    if (data.kind === 'list' && data.ordered === undefined)
      context.addIssue({ code: 'custom', message: 'A list requires an explicit order policy' });
    if (data.kind === 'chart' && !(data.chartType && data.chartTitle && data.chartData))
      context.addIssue({ code: 'custom', message: 'A chart requires typed chart data' });
    for (const [field, kinds] of Object.entries({
      text: ['text', 'link', 'code'],
      marks: ['text', 'link'],
      ordered: ['list'],
      language: ['code'],
      alignment: ['cell'],
      href: ['link'],
      chartType: ['chart'],
      chartTitle: ['chart'],
      chartUnit: ['chart'],
      chartData: ['chart'],
    })) {
      if (field in data && !kinds.includes(data.kind))
        context.addIssue({ code: 'custom', message: `${field} does not belong to ${data.kind}` });
    }
  });
export type ContentInput = z.infer<typeof contentInput>;

/** The retained grammar is independent of layout and follows references in the selected snapshot. */
export async function contentText(
  view: ReadView<typeof wikiSchema>,
  root: ContentRef,
): Promise<string> {
  const contents = await view.entities.wikiContent.query({ select: contentSelection });
  const placements = await view.entities.wikiAppearances.query({
    select: { content: true, parent: true, order: true, key: true, available: true },
    orderBy: [{ order: 'asc' }, { key: 'asc' }],
  });
  const visit = (ref: ContentRef, path: readonly ContentRef[]): string => {
    if (path.some((item) => sameEntity(item, ref))) throw new Error('Recursive Wiki content');
    const value = contents.find((item) => sameEntity(item, ref));
    if (!value?.available) return '';
    if (value.text !== undefined) return value.text;
    const children = placements.filter(
      (item) => item.available && item.parent && sameEntity(item.parent, ref),
    );
    const next = [...path, ref];
    const texts = children.map((item) => visit(item.content, next));
    if (value.kind === 'item') {
      const inline = children
        .flatMap((item, index) => {
          const kind = contents.find((child) => sameEntity(child, item.content))?.kind;
          return kind === 'text' || kind === 'link' ? [texts[index]!] : [];
        })
        .join('');
      const blocks = children.flatMap((item, index) => {
        const kind = contents.find((child) => sameEntity(child, item.content))?.kind;
        return kind === 'text' || kind === 'link' ? [] : [texts[index]!];
      });
      return [inline, ...blocks].filter(Boolean).join('\n');
    }
    const separator = ['paragraph', 'heading', 'cell'].includes(value.kind)
      ? ''
      : value.kind === 'row'
        ? '\t'
        : '\n';
    return (value.kind === 'row' ? texts : texts.filter(Boolean)).join(separator);
  };
  return visit(root, []);
}

export function selectedText(text: string, start: number, end: number): string {
  const boundary = (offset: number) => {
    const a = text.charCodeAt(offset - 1),
      b = text.charCodeAt(offset);
    return !(a >= 0xd8_00 && a <= 0xdb_ff && b >= 0xdc_00 && b <= 0xdf_ff);
  };
  if (
    !(Number.isSafeInteger(start) && Number.isSafeInteger(end)) ||
    start < 0 ||
    end <= start ||
    end > text.length ||
    !boundary(start) ||
    !boundary(end)
  )
    throw new Error('Selection is outside text or splits a UTF-16 surrogate pair');
  return text.slice(start, end);
}
