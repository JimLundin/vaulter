import {
  sameEntity,
  clear,
  SaveError,
  type Database,
  type EntityDefinition,
  type EntityRef,
  type Registry,
  type TransactionRef,
  type TransactionChange,
} from '@/vault/eav/index.ts';
import type { HistoryEntry, HistorySource } from './entries.ts';

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

/** Accepted EAV transactions in journal order, with evidence resolved at each recorded snapshot. */
export function vaultHistory<R extends Registry>(options: {
  readonly database: () => Promise<Database<R>>;
  readonly compensation?: {
    /** Application owns the admission policy and mutable record allow-list. */
    readonly types: readonly (keyof R)[];
    readonly author: () => Promise<EntityRef<EntityDefinition>>;
    readonly admission?: () => void;
  };
}): HistorySource {
  const pending = new Map<number, SaveError>();
  const active = new Map<number, Promise<void>>();
  const undo = (
    db: Database<R>,
    sequence: number,
    changes: readonly TransactionChange<R>[],
  ): Promise<void> => {
    const current = active.get(sequence);
    if (current !== undefined) return current;
    const work = (async () => {
      const policy = options.compensation!;
      policy.admission?.();
      const retained = pending.get(sequence);
      try {
        if (retained) {
          await retained.retry();
        } else {
          const author = await policy.author();
          policy.admission?.();
          await db.transaction({ author }, async (tx) => {
            policy.admission?.();
            for (const change of changes) {
              const latest = await db.history.entities[change.type].first({
                where: { entity: { eq: change.entity } },
                select: { sequence: true },
                orderBy: [{ sequence: 'desc' }],
              });
              if (latest?.sequence !== sequence)
                throw new Error(
                  'A changed record has newer history; this transaction cannot be undone.',
                );
              const values: Record<string, unknown> = Object.fromEntries(
                Object.entries(change.before!),
              );
              for (const field of Object.keys(change.after!)) {
                if (!Object.hasOwn(change.before!, field)) values[field] = clear;
              }
              // Registry dispatch retains the entity/version token; the owner policy admits these updates.
              const writer = tx.entities[change.type] as {
                update: (
                  value: EntityRef<EntityDefinition> & Readonly<Record<string, unknown>>,
                ) => Promise<void>;
              };
              await writer.update({ ...change.after!, ...values });
            }
            policy.admission?.();
          });
        }
        pending.delete(sequence);
      } catch (error) {
        if (error instanceof SaveError) pending.set(sequence, error);
        else pending.delete(sequence);
        throw error;
      }
    })();
    active.set(sequence, work);
    work.then(
      () => active.delete(sequence),
      () => active.delete(sequence),
    );
    return work;
  };
  return {
    subscribe(listener) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      void options
        .database()
        .then((db) => {
          if (!closed) {
            unsubscribe = db.subscribe(listener);
            listener();
          }
        })
        .catch(() => {
          /* entries reports opening failures. */
        });
      return () => {
        closed = true;
        unsubscribe?.();
      };
    },
    async entries({ before, limit = 25 } = {}) {
      const db = await options.database();
      const candidates: { key: string; sequence: number; load: () => Promise<HistoryEntry> }[] = [];
      {
        const transactions = await db.history.transactions.query({
          select: { sequence: true, committedAt: true, author: true, origin: true },
          orderBy: [{ sequence: 'asc' }],
        });
        for (const [index, transaction] of transactions.entries()) {
          candidates.push({
            key: `eav:${transaction.sequence}`,
            sequence: transaction.sequence,
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
                  const at = change.after ? transaction : transactions[index - 1];
                  const record = at ? await db.history.inspect(at, change.entity) : undefined;
                  const type = (record?.type ?? String(change.type))
                    .replaceAll('.', ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .toLowerCase();
                  const action =
                    change.before === null
                      ? 'Created'
                      : change.after === null
                        ? 'Deleted'
                        : 'Updated';
                  const values = change.after ?? change.before!;
                  const name = label(values, '');
                  const title = `${action} ${type}${name ? `: ${name}` : ''}`;
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
                          return {
                            line: `${field}: ${from} → ${to}${from === to ? ' (reference changed)' : ''}`,
                            field: {
                              label: field,
                              before: typeof previous === 'string' ? previous : from,
                              after:
                                typeof next === 'string'
                                  ? next
                                  : `${to}${from === to ? ' (reference changed)' : ''}`,
                            },
                          };
                        })(),
                      ];
                    }),
                  );
                  return {
                    title,
                    details: [title, ...edits.map((edit) => edit.line)],
                    fields: edits.map((edit) => edit.field),
                  };
                }),
              );
              return {
                key: `eav:${transaction.sequence}`,
                undo:
                  options.compensation &&
                  changes.length > 0 &&
                  changes.every(
                    (change) =>
                      options.compensation!.types.includes(change.type) &&
                      change.before !== null &&
                      change.after !== null,
                  )
                    ? () => undo(db, transaction.sequence, changes)
                    : undefined,
                title:
                  details.length === 1 ? details[0].title : `Recorded ${details.length} changes`,
                recordedAt: transaction.committedAt.toISOString(),
                sequence: transaction.sequence,
                author: author ? label(author.values, author.type) : undefined,
                origin: origin ? label(origin.values, origin.type) : undefined,
                details: details.flatMap((entry) => entry.details),
                changes: details.map(({ title, fields }) => ({ title, fields })),
              };
            },
          });
        }
      }
      // Reconstruct before/after evidence only for the requested page.
      candidates.sort((a, b) => b.sequence - a.sequence);
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
