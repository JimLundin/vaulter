import { tool } from 'ai';
import { z } from 'zod';
import type { EntityRef, TransactionContext } from '@/core/store/index.ts';
import type { Actor } from '@/modules/actors/index.ts';
import { wikiActions } from './operations.ts';
import { contentInput } from './content.ts';
import { readEavWiki } from './pages.ts';
import type { WikiDatabase } from '@/modules/wiki/reviews/selection.ts';

export const wikiCapabilities = [
  'listWikiPages',
  'readWikiPage',
  'createWikiPage',
  'updateWikiPage',
  'appendWikiContent',
  'updateWikiContent',
  'removeWikiContent',
].map((name) => ({ name, version: '1' }));

/** Tool arguments carry navigation keys. Trusted author/origin and resource lifetime are supplied. */
export function wikiTools(
  db: WikiDatabase,
  context: {
    author: EntityRef<typeof Actor>;
    origin?: TransactionContext['origin'];
    signal: AbortSignal;
  },
) {
  const actions = wikiActions(db, context.author, context.origin, undefined, context.signal);
  const check = () => context.signal.throwIfAborted();
  const recover = async <T>(operation: () => Promise<T>, readback: () => Promise<unknown>) => {
    check();
    await operation();
    check();
    return readback();
  };
  const page = async (key: string) => {
    const found = await db.entities.wikiPages.first({ where: { key: { eq: key } }, select: {} });
    if (!found) throw new Error('Wiki page not found');
    return found;
  };
  const content = async (key: string) => {
    const found = await db.entities.wikiContent.first({ where: { key: { eq: key } }, select: {} });
    if (!found) throw new Error('Wiki content not found');
    return found;
  };
  const receipt = async (key: string) => {
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const entity =
      (await db.entities.wikiPages.first({ where: { key: { eq: key } }, select: {} })) ??
      (await content(key));
    return { key, accepted: true, address: await db.history.reference(snapshot, entity) };
  };
  return {
    listWikiPages: tool({
      description: 'List native Wiki pages. A page does not automatically become a broad Topic.',
      inputSchema: z.object({}),
      execute: async () => {
        check();
        return (await readEavWiki(db)).map(({ id, title, summary }) => ({
          key: id,
          title,
          summary,
        }));
      },
    }),
    readWikiPage: tool({
      description:
        'Read current Wiki prose and evidence coverage, keeping unsupported and disputed statements explicit.',
      inputSchema: z.object({ key: z.string().min(1) }),
      execute: async ({ key }) => {
        check();
        return (await readEavWiki(db)).find((page) => page.id === key) ?? null;
      },
    }),
    createWikiPage: tool({
      description:
        'Create a Wiki page in EAV. Prose and summaries start without asserted evidence support.',
      inputSchema: z.object({
        key: z.string().min(1),
        title: z.string().min(1).max(200),
        summary: z.string(),
        aliases: z.array(z.string()).optional(),
      }),
      execute: (input) =>
        recover(
          () => actions.createPage(input),
          () => receipt(input.key),
        ),
    }),
    updateWikiPage: tool({
      description:
        'Edit a Wiki page title or summary; changed selected summary text requires review again.',
      inputSchema: z.object({
        key: z.string().min(1),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().optional(),
        aliases: z.array(z.string()).optional(),
      }),
      execute: async ({ key, ...input }) =>
        recover(
          async () => actions.updatePage(await page(key), input),
          () => receipt(key),
        ),
    }),
    appendWikiContent: tool({
      description:
        'Append typed content with explicit sibling order to exactly one page or content parent.',
      inputSchema: z.object({
        key: z.string().min(1),
        content: contentInput,
        page: z.string().optional(),
        parent: z.string().optional(),
        order: z.string().min(1),
      }),
      execute: async (input) => {
        const placement = {
          ...(input.page && { page: await page(input.page) }),
          ...(input.parent && { parent: await content(input.parent) }),
          order: input.order,
        };
        return recover(
          () => actions.append(input.key, input.content, placement),
          () => receipt(input.key),
        );
      },
    }),
    updateWikiContent: tool({
      description:
        'Edit existing typed Wiki content; every appearance shares the same retained identity.',
      inputSchema: z.object({ key: z.string().min(1), content: contentInput }),
      execute: async (input) =>
        recover(
          async () => actions.updateContent(await content(input.key), input.content),
          () => receipt(input.key),
        ),
    }),
    removeWikiContent: tool({
      description:
        'Make Wiki content unavailable without erasing appearances or history. Restore with available=true.',
      inputSchema: z.object({ key: z.string().min(1), available: z.boolean().default(false) }),
      execute: async (input) =>
        recover(
          async () => actions.removeContent(await content(input.key), input.available),
          () => receipt(input.key),
        ),
    }),
  };
}
