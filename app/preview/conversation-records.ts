import type { Database } from '@/vault/eav/index.ts';
import type { applicationSchema } from '@/application/composition.ts';
import { appendExchange } from '@/workflows/chat/data/operations.ts';

/** Fictional contributions use one native dialogue and survive reload without execution. */
export async function seedConversation(db: Database<typeof applicationSchema>) {
  if (await db.entities.conversations.first({ select: {} })) return;
  await db.transaction(async (tx) => {
    const author = await tx.entities.actors.insert({ name: 'Fictional owner', kind: 'user' });
    for (const [index, text] of [
      'Garden studio plans',
      'A quiet week by the coast',
      'Keeping mornings free for focused work',
      'Books and ideas to return to',
      'Dinner with the neighbours',
      'Making space for the things that matter',
    ].entries()) {
      const at = new Date(Date.UTC(2026, 9, 11 - index, 9, 30));
      const exchange = await appendExchange(tx, at);
      await tx.entities.messages.insert({ exchange, author, at, text });
    }
  });
}
