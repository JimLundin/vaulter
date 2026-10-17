import {
  sameEntity,
  type Database,
  type EntityDefinition,
  type EntityRef,
  type Registry,
  type TransactionRef,
} from '../../eav/index.ts';
import type { NodeReading } from '../../nodes/store.ts';
import {
  nodeHistoryEntry,
  type HistoryEntry,
  type HistorySource,
  type NodeHistorySource,
} from './entries.ts';

function label(values: Readonly<Record<string, unknown>>, fallback: string) {
  for (const key of ['title', 'name', 'label', 'text', 'key']) {
    const value = values[key];
    if (typeof value === 'string' && value.trim()) return value.trim().split('\n')[0].slice(0, 120);
  }
  return fallback;
}
const reference = (value: unknown): value is EntityRef<EntityDefinition> =>
  sameEntity(value, value);
function equal(a: unknown, b: unknown): boolean {
  if (reference(a) || reference(b)) return sameEntity(a, b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = Object.entries(a);
    const right = Object.entries(b);
    return (
      left.length === right.length &&
      left.every(([key, value]) => Object.hasOwn(b, key) && equal(value, Reflect.get(b, key)))
    );
  }
  return a === b;
}
async function valueText<R extends Registry>(
  db: Database<R>,
  at: TransactionRef | undefined,
  value: unknown,
): Promise<string> {
  if (value === undefined) return 'not set';
  if (value instanceof Date) return value.toISOString();
  if (reference(value)) {
    const record = at ? await db.history.inspect(at, value) : undefined;
    return record
      ? `${record.type}: ${label(record.values, 'reference')}`
      : 'unavailable reference';
  }
  if (Array.isArray(value))
    return `[${(await Promise.all(value.map((item) => valueText(db, at, item)))).join(', ')}]`;
  return JSON.stringify(value);
}

/** Read-only mixed history. Timestamp order is presentation, never a shared transaction sequence. */
export function vaultHistory<R extends Registry>(options: {
  readonly nodes: NodeReading;
  readonly legacy: NodeHistorySource;
  readonly database?: () => Promise<Database<R>>;
}): HistorySource {
  return {
    subscribe(listener) {
      const unsubscribe = options.legacy.subscribe(listener);
      let closed = false;
      let unsubscribeEav: (() => void) | undefined;
      void options
        .database?.()
        .then((db) => {
          if (!closed) {
            unsubscribeEav = db.subscribe(listener);
            listener();
          }
        })
        .catch(() => {
          /* entries reports opening failures. */
        });
      return () => {
        closed = true;
        unsubscribe();
        unsubscribeEav?.();
      };
    },
    async entries({ before, limit = 25 } = {}) {
      const [nodeTransactions, db] = await Promise.all([
        options.nodes.history({ limit: Number.MAX_SAFE_INTEGER }),
        options.database?.(),
      ]);
      const candidates = nodeTransactions.map((transaction) => ({
        key: `node:${transaction.id}`,
        time: new Date(transaction.recordedAt).getTime(),
        sequence: transaction.sequence,
        source: 'node',
        async load(): Promise<HistoryEntry> {
          const snapshot = await options.nodes.snapshot(transaction.sequence);
          const entry = {
            transaction,
            author: snapshot.get(transaction.recordedBy)!,
            origin: transaction.origin ? snapshot.get(transaction.origin)! : null,
            differences: await options.nodes.changes(transaction.id),
          };
          return nodeHistoryEntry(
            entry,
            options.legacy.undo && options.legacy.canUndo?.(entry)
              ? () => options.legacy.undo!(entry)
              : undefined,
          );
        },
      }));
      if (db) {
        const transactions = await db.history.transactions.query({
          select: { sequence: true, committedAt: true, author: true, origin: true },
          orderBy: [{ sequence: 'asc' }],
        });
        for (const [index, transaction] of transactions.entries()) {
          candidates.push({
            key: `eav:${transaction.sequence}`,
            time: transaction.committedAt.getTime(),
            sequence: transaction.sequence,
            source: 'eav',
            async load() {
              const [changes, author, origin] = await Promise.all([
                db.history.changes(transaction),
                transaction.author
                  ? db.history.inspect(transaction, transaction.author)
                  : undefined,
                transaction.origin
                  ? db.history.inspect(transaction, transaction.origin)
                  : undefined,
              ]);
              const details = await Promise.all(
                changes.map(async (change) => {
                  const type = String(change.type);
                  const action =
                    change.before === null
                      ? 'Created'
                      : change.after === null
                        ? 'Deleted'
                        : 'Updated';
                  const values = change.after ?? change.before!;
                  const title = `${action} ${type}: ${label(values, type)}`;
                  const fields = new Set([
                    ...Object.keys(change.before ?? {}),
                    ...Object.keys(change.after ?? {}),
                  ]);
                  const edits = await Promise.all(
                    [...fields].flatMap((field) => {
                      const previous: unknown = change.before
                        ? Reflect.get(change.before, field)
                        : undefined;
                      const next: unknown = change.after
                        ? Reflect.get(change.after, field)
                        : undefined;
                      if (equal(previous, next)) return [];
                      return [
                        (async () => {
                          const [from, to] = await Promise.all([
                            valueText(db, transactions[index - 1], previous),
                            valueText(db, transaction, next),
                          ]);
                          return `${field}: ${from} → ${to}${from === to ? ' (reference changed)' : ''}`;
                        })(),
                      ];
                    }),
                  );
                  return [title, ...edits];
                }),
              );
              return {
                key: `eav:${transaction.sequence}`,
                title: details.length === 1 ? details[0][0] : `Recorded ${details.length} changes`,
                recordedAt: transaction.committedAt.toISOString(),
                sequence: transaction.sequence,
                author: author ? label(author.values, author.type) : undefined,
                origin: origin ? label(origin.values, origin.type) : undefined,
                details: details.flat(),
              };
            },
          });
        }
      }
      // Scan metadata only; reconstruct before/after values for the requested page.
      candidates.sort(
        (a, b) => b.time - a.time || a.source.localeCompare(b.source) || b.sequence - a.sequence,
      );
      const cursor =
        before === undefined ? -1 : candidates.findIndex((entry) => entry.key === before);
      if (before !== undefined && cursor === -1)
        throw new Error('History cursor is unavailable; reload history');
      return Promise.all(
        candidates.slice(cursor + 1, cursor + 1 + limit).map((entry) => entry.load()),
      );
    },
  };
}
