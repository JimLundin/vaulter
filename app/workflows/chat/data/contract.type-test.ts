import type { Database, EntityRef } from '@/vault/eav/index.ts';
import type { chatSchema, Conversation, Message } from './schema.ts';

/** Compile-only contract: domain references are objects and projections keep their identity. */
export async function chatDataContract(
  db: Database<typeof chatSchema>,
  conversation: EntityRef<typeof Conversation>,
  message: EntityRef<typeof Message>,
) {
  const first = await db.entities.messages.first({
    where: { exchange: { matches: { conversation: { eq: conversation } } } },
    select: { text: true, exchange: { run: { requestedModel: true } } },
    orderBy: [{ at: 'asc' }],
  });
  if (first) {
    const text: string = first.text;
    const model: string | undefined = first.exchange.run?.requestedModel;
    await db.transaction((tx) => tx.entities.messages.update({ ...first, text }));
    void model;
  }
  await db.entities.messages.get(message, {
    select: { exchange: { conversation: { createdAt: true } } },
  });
  // @ts-expect-error An address string cannot identify a Message in the object interface.
  await db.entities.messages.get('message-id', { select: {} });
  // @ts-expect-error A Conversation cannot identify a Message.
  await db.entities.messages.get(conversation, { select: {} });
  // @ts-expect-error JSON is selected as one value; it is not an entity reference.
  await db.entities.agentRuns.first({ select: { settings: { temperature: true } } });
  // @ts-expect-error JSON cannot be used as a sortable scalar.
  await db.entities.agentRuns.query({ select: {}, orderBy: [{ settings: 'asc' }] });
  await db.transaction(async (tx) => {
    // @ts-expect-error Insert takes the required data without an entity identity.
    await tx.entities.messages.insert(message);
    // @ts-expect-error A contribution references an Agent run, never a Message.
    await tx.entities.exchanges.insert({ conversation, position: 0, run: message });
    // @ts-expect-error Plain data does not carry update identity.
    await tx.entities.messages.update({ text: 'Changed' });
  });
}
