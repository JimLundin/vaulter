import { tool } from 'ai';
import { z } from 'zod';
import type { DomainDatabase } from '@/application/store/index.ts';
import type { chatSchema } from './records.ts';
import { projectedExchange } from './projection.ts';

export const historyCapability = { name: 'readConversationHistory', version: '1' } as const;
/** Original dialogue is retrievable even when the effective input starts from a checkpoint. */
export function historyTool(db: DomainDatabase<typeof chatSchema>) {
  return tool({
    description:
      'Read original conversation activity by position. Use this to verify a context checkpoint or recover omitted details. Start at position 0 and follow next to page forward. Reading never resumes recorded work.',
    inputSchema: z.object({
      from: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: ({ from, limit }) =>
      db.transaction(async (tx) => {
        const entries = await tx.entities.exchanges.query({
          where: { position: { gte: from } },
          select: { position: true },
          orderBy: [{ position: 'asc' }],
          limit: limit + 1,
        });
        const activity = [];
        for (const entry of entries.slice(0, limit))
          activity.push({
            position: entry.position,
            messages: await projectedExchange(tx, entry),
          });
        return { activity, next: entries[limit]?.position ?? null };
      }),
  });
}
