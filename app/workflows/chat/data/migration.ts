import type { Database, Transaction } from '@/vault/eav/index.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';
import { canonical } from '@/vault/nodes/json.ts';
import type { NodeVersion } from '@/vault/nodes/model.ts';
import { savedMessages, type SavedMessage } from '@/workflows/chat/records/chat-store.ts';
import { appendExchange, conversation } from './operations.ts';
import type { chatSchema } from './schema.ts';

/** Convert once; normal Chat reads never consult the retired selectable-chat layout. */
export async function migrateDialogue(db: Database<typeof chatSchema>, nodes: TransactionStore) {
  const key = 'node-chat-v1';
  if (await db.entities.chatMigrations.first({ where: { key: { eq: key } }, select: {} })) return;
  const snapshot = await nodes.snapshot();
  const sources: { root: NodeVersion; exchange: NodeVersion; message: SavedMessage }[] = [];
  for (const root of snapshot.roots()) {
    if (root.data?.kind !== 'conversation') continue;
    const messages = await savedMessages(nodes, root.key.node, snapshot.sequence);
    for (const exchange of snapshot.children(root.key.node)) {
      if (exchange.data?.kind !== 'exchange') continue;
      const children = messages.filter(
        (message) => message.version.placement?.parent === exchange.key.node,
      );
      for (const message of children) sources.push({ root, exchange, message });
    }
  }
  // A historical contribution belongs to the continuous timeline. Old containers are provenance,
  // not ordering boundaries. Compare instants across offsets, then original placement and identity.
  const position = ({ root, exchange, message }: (typeof sources)[number]) =>
    [root, exchange, message.version]
      .map((version) => `${version.placement?.order ?? ''}:${version.key.node}`)
      .join('/');
  sources.sort((a, b) => {
    const time = Date.parse(a.message.data.at) - Date.parse(b.message.data.at);
    if (time) return time;
    const left = position(a);
    const right = position(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  await db.transaction(async (tx: Transaction<typeof chatSchema>) => {
    if (await tx.entities.chatMigrations.first({ where: { key: { eq: key } }, select: {} })) return;
    await conversation(tx);
    for (const source of sources) {
      const { message } = source;
      const exchange = await appendExchange(tx, new Date(message.data.at));
      await tx.entities.retainedSources.insert({
        exchange,
        position: 0,
        speaker: message.data.role === 'record' ? 'unknown' : message.data.role,
        occurredAt: message.data.at,
        ...(message.data.atPrecision && { occurredAtPrecision: message.data.atPrecision }),
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
            ordering: 'message-instant-then-source-placement',
          }),
        ),
      });
    }
    await tx.entities.chatMigrations.insert({ key, sourceSequence: snapshot.sequence });
  });
}
