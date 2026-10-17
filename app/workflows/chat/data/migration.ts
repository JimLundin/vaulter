import type { Database, Transaction } from '../../../vault/eav/index.ts';
import type { TransactionStore } from '../../../vault/transactions/store.ts';
import { canonical } from '../../../vault/nodes/json.ts';
import type { NodeVersion } from '../../../vault/nodes/model.ts';
import { savedMessages, type SavedMessage } from '../records/chat-store.ts';
import { appendExchange, conversation } from './operations.ts';
import type { chatSchema } from './schema.ts';

/** Convert once; normal Chat reads never consult the retired selectable-chat layout. */
export async function migrateDialogue(db: Database<typeof chatSchema>, nodes: TransactionStore) {
  const key = 'node-chat-v1';
  if (await db.entities.chatMigrations.first({ where: { key: { eq: key } }, select: {} })) return;
  const snapshot = await nodes.snapshot();
  const sources: { root: NodeVersion; exchange: NodeVersion; children: readonly SavedMessage[] }[] =
    [];
  for (const root of snapshot.roots()) {
    if (root.data?.kind !== 'conversation') continue;
    const messages = await savedMessages(nodes, root.key.node, snapshot.sequence);
    for (const exchange of snapshot.children(root.key.node)) {
      if (exchange.data?.kind !== 'exchange') continue;
      const children = messages.filter(
        (message) => message.version.placement?.parent === exchange.key.node,
      );
      sources.push({ root, exchange, children });
    }
  }
  // Retain source order deterministically. Equal/unknown occurrence times are not claimed as precise chronology.
  sources.sort(
    (a, b) =>
      String(a.exchange.data?.startedAt ?? '').localeCompare(
        String(b.exchange.data?.startedAt ?? ''),
      ) ||
      a.root.key.node.localeCompare(b.root.key.node) ||
      String(a.exchange.placement?.order).localeCompare(String(b.exchange.placement?.order)),
  );
  await db.transaction(async (tx: Transaction<typeof chatSchema>) => {
    if (await tx.entities.chatMigrations.first({ where: { key: { eq: key } }, select: {} })) return;
    await conversation(tx);
    for (const source of sources) {
      const date =
        typeof source.exchange.data?.startedAt === 'string' &&
        /T\d{2}:\d{2}:\d{2}/.test(source.exchange.data.startedAt)
          ? new Date(source.exchange.data.startedAt)
          : undefined;
      const exchange = await appendExchange(
        tx,
        date && Number.isFinite(date.getTime()) ? date : undefined,
      );
      for (const [position, message] of source.children.entries()) {
        await tx.entities.retainedSources.insert({
          exchange,
          position,
          speaker: message.data.role === 'record' ? 'unknown' : message.data.role,
          occurredAt: message.data.at,
          ...(message.data.role === 'agent'
            ? { activity: JSON.parse(canonical(message.data.parts)), status: message.data.status }
            : { text: message.data.text }),
          ...(message.data.role === 'record' &&
            message.data.record.label && { label: message.data.record.label }),
          provenance: JSON.parse(
            canonical({
              system: 'nodes',
              snapshot: snapshot.sequence,
              conversation: source.root.key,
              title: source.root.data?.title ?? null,
              exchange: source.exchange.key,
              message: message.version.key,
              original: message.version.data,
              parts: message.sources ?? [],
              occurrence: source.exchange.data,
              ordering: 'occurrence-then-source-order',
            }),
          ),
        });
      }
    }
    await tx.entities.chatMigrations.insert({ key, sourceSequence: snapshot.sequence });
  });
}
