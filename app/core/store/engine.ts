import { refreshStorage, persist, SaveError, storageClosed } from './persistence.ts';
import { encodeJson } from './json.ts';
import {
  captureReference,
  resolveReference,
  captureRetainedStateReference,
  resolveRetainedStateReference,
} from './references.ts';
import {
  e,
  describe,
  checkCompatibility,
  attributeKey,
  type EntityDefinition,
  type Registry,
} from './schema.ts';
import { entityIdentity, identify, materialize } from './identity.ts';
import {
  createMemoryStorage,
  readStorage,
  publish,
  observe,
  snapshotAt,
  changes,
  atomKey,
  typeAttribute,
  liveAttribute,
  isLive,
  recordType,
  ConflictError,
  type Snapshot,
  type Atom,
  type RecordState,
  type Commit,
  type Attribution,
} from './memory.ts';
import {
  object,
  keys,
  scalar,
  reference,
  project,
  selectRecords,
  queryYield,
  validateSelection,
  limit,
  type QueryContext,
  type QueryInput,
} from './query.ts';
import { clear, type Database, type OpenOptions, type TransactionContext } from './types.ts';

const anyEntity = e.entity('@any', {});
const transactionEntity = e.entity('@transaction', {
  sequence: e.number(),
  committedAt: e.datetime(),
  schemaRevision: e.number(),
  author: e.ref(anyEntity).optional(),
  origin: e.ref(anyEntity).optional(),
});
const presence = (key: string) => `@has:${key}`;
const allFields = (entity: EntityDefinition) =>
  Object.fromEntries(
    Object.entries(entity.fields)
      .filter(([, field]) => field.kind !== 'inverse')
      .map(([name]) => [name, true]),
  );

interface Scope {
  open: boolean;
  failed: unknown;
  snapshot: Snapshot;
  readonly touched: Set<string>;
}
interface ChangeInput {
  readonly select: unknown;
  readonly where?: {
    readonly entity?: { readonly eq: unknown };
    readonly transaction?: { readonly eq: unknown };
    readonly sequence?: unknown;
  };
  readonly orderBy?: readonly { readonly sequence: 'asc' | 'desc' }[];
  readonly limit?: number | null;
}

// biome-ignore lint/suspicious/useAwait: This async interface converts synchronous validation failures into promise rejections.
export async function openDatabase<const R extends Registry>(
  options: OpenOptions<R>,
): Promise<Database<R>> {
  const storage = options.storage ?? createMemoryStorage();
  await refreshStorage(storage);
  const registry = Object.freeze({ ...options.schema });
  const schema = describe(registry);
  const initial = readStorage(storage);
  const previous = initial.schemas.at(-1);
  if (previous) checkCompatibility(previous.schema, schema);
  if (!previous || JSON.stringify(previous.schema) !== JSON.stringify(schema)) {
    publish(storage, initial.generation, {
      ...initial,
      schemas: [...initial.schemas, { revision: initial.schemas.length + 1, schema }],
    });
  }
  const schemaRevision = readStorage(storage).schemas.length;
  const definitions = new Map(
    Object.values(registry).map((definition) => [definition.name, definition]),
  );
  definitions.set(transactionEntity.name, transactionEntity);
  let open = true;
  const scopes = new Set<Scope>();
  const subscriptions = new Set<() => void>();
  const ensure = () => {
    if (!open || storageClosed(storage)) throw new Error('Database handle is closed');
    if (readStorage(storage).schemas.length !== schemaRevision)
      throw new Error('Database schema changed; reopen the handle');
  };
  const context = (snapshot: Snapshot, sequence: number): QueryContext => ({
    storage,
    definitions,
    snapshot,
    sequence,
  });
  const commitFor = (value: unknown): Commit => {
    const identity = identify(storage, value, transactionEntity.name);
    const commit = readStorage(storage).commits.find((item) => item.id === identity.id);
    if (!commit) throw new Error('Transaction is not committed');
    return commit;
  };
  const readEntities = (read: () => QueryContext) =>
    Object.fromEntries(
      Object.entries(registry).map(([name, entity]) => {
        const query = async (input: QueryInput, first = false) => {
          ensure();
          const view = read();
          const records = await selectRecords(view, entity, input, first);
          ensure();
          if (view.issuance) read(); // Recheck the transaction scope after asynchronous work.
          const result = [];
          for (const [index, [id, record]] of records.entries()) {
            if (index && index % 100 === 0) {
              await queryYield();
              ensure();
              if (view.issuance) read(); // Recheck the transaction scope after asynchronous work.
            }
            result.push(project(view, entity, id, record, input.select));
          }
          return result;
        };
        return [
          name,
          Object.freeze({
            // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
            get: async (value: unknown, options: { readonly select: unknown }) => {
              ensure();
              const view = read();
              keys(object(options, 'Get options'), ['select'], 'get option');
              validateSelection(view, entity, options.select);
              const identity = identify(storage, value, entity.name);
              const record = view.snapshot.get(identity.id);
              return isLive(record)
                ? project(view, entity, identity.id, record, options.select)
                : undefined;
            },
            query,
            first: async (input: QueryInput) => (await query(input, true))[0],
          }),
        ];
      }),
    );
  const entities = readEntities(() => {
    const stored = readStorage(storage);
    return context(stored.current, stored.commits.length);
  });

  const transaction = async (
    input: TransactionContext | ((tx: unknown) => Promise<unknown>),
    callback?: (tx: unknown) => Promise<unknown>,
  ) => {
    ensure();
    await refreshStorage(storage);
    ensure();
    const work = typeof input === 'function' ? input : callback;
    if (typeof work !== 'function') throw new Error('Transaction requires a callback');
    const metadata = typeof input === 'function' ? {} : input;
    keys(object(metadata, 'Transaction context'), ['author', 'origin'], 'transaction context');
    const base = readStorage(storage);
    const issuance = { sequence: base.commits.length, valid: true };
    let completed = false;
    const scope: Scope = {
      open: true,
      failed: undefined,
      snapshot: base.current,
      touched: new Set(),
    };
    scopes.add(scope);
    const active = () => {
      ensure();
      if (!scope.open) throw new Error('Transaction is closed');
      if (scope.failed !== undefined)
        throw new Error('Transaction contains a failed operation', { cause: scope.failed });
    };
    const view = () => {
      active();
      return { ...context(scope.snapshot, base.commits.length), issuance };
    };
    const attribution = (value: unknown): Attribution | null => {
      if (value === undefined) return null;
      const identity = identify(storage, value);
      if (!isLive(scope.snapshot.get(identity.id)))
        throw new Error('Attribution entity is unavailable');
      return { id: identity.id, type: identity.type };
    };
    // biome-ignore lint/suspicious/useAwait: This async interface converts synchronous validation failures into promise rejections.
    const perform = async <T>(operation: () => T): Promise<T> => {
      try {
        active();
        return operation();
      } catch (error) {
        scope.failed = error ?? new Error('Write failed');
        throw error;
      }
    };
    const writeRecord = (
      entity: EntityDefinition,
      id: string,
      data: unknown,
      inserting: boolean,
    ) => {
      const values = object(data, 'Entity data');
      for (const symbol of Object.getOwnPropertySymbols(values))
        if (symbol !== entityIdentity || inserting)
          throw new Error('Unexpected identity or symbol in entity data');
      keys(values, Object.keys(entity.fields), 'write attribute');
      const record = new Map(scope.snapshot.get(id));
      if (inserting) {
        record.set(typeAttribute, [entity.name]);
        record.set(liveAttribute, [true]);
      }
      for (const [name, value] of Object.entries(values)) {
        const field = entity.fields[name]!.definition;
        if (field.kind === 'inverse') throw new Error(`Derived attribute is read-only: ${name}`);
        const key = attributeKey(entity.name, name, field);
        if (value === clear) {
          if (!field.optional) throw new Error(`Cannot clear required attribute: ${name}`);
          record.delete(key);
          record.delete(presence(key));
          continue;
        }
        const member = field.kind === 'set' ? field.member! : field;
        if (field.kind === 'set' && !Array.isArray(value))
          throw new Error(`Expected set array: ${name}`);
        const incoming: unknown[] = field.kind === 'set' ? (value as unknown[]) : [value];
        const atoms = incoming.map((item) =>
          member.kind === 'historical' || member.kind === 'retained-state'
            ? ((member.kind === 'historical' ? resolveReference : resolveRetainedStateReference)(
                storage,
                item,
              ),
              { history: encodeJson(item) })
            : member.kind === 'ref'
              ? reference(view(), member, item)
              : scalar(member, item),
        );
        const distinct = [...new Map(atoms.map((atom) => [atomKey(atom), atom])).values()];
        record.set(
          key,
          distinct.sort((a, b) => atomKey(a).localeCompare(atomKey(b))),
        );
        if (field.kind === 'set') record.set(presence(key), [true]);
      }
      for (const [name, field] of Object.entries(entity.fields)) {
        const key = attributeKey(entity.name, name, field.definition);
        if (
          !field.isOptional &&
          field.kind !== 'inverse' &&
          !record.has(key) &&
          !record.has(presence(key))
        )
          throw new Error(`Missing required attribute: ${name}`);
      }
      scope.snapshot = new Map(scope.snapshot).set(id, record);
      scope.touched.add(id);
      return record;
    };
    const writableIdentity = (entity: EntityDefinition, value: unknown) => {
      const identity = identify(storage, value, entity.name);
      if (!isLive(scope.snapshot.get(identity.id))) throw new Error('Entity is unavailable');
      if (
        base.commits.some(
          (commit) =>
            commit.sequence > identity.sequence &&
            commit.facts.some((fact) => fact.entity === identity.id),
        )
      )
        throw new ConflictError();
      return identity.id;
    };
    const txEntities = readEntities(view);
    for (const [name, entity] of Object.entries(registry)) {
      txEntities[name] = Object.freeze({
        ...txEntities[name]!,
        insert: (data: unknown) =>
          perform(() => {
            const id = crypto.randomUUID();
            const record = writeRecord(entity, id, data, true);
            return project(view(), entity, id, record, allFields(entity));
          }),
        update: (data: unknown) =>
          perform(() => {
            writeRecord(entity, writableIdentity(entity, data), data, false);
          }),
        delete: (value: unknown) =>
          perform(() => {
            const id = writableIdentity(entity, value);
            if (!base.current.has(id)) scope.snapshot = new Map(scope.snapshot).set(id, new Map());
            else
              scope.snapshot = new Map(scope.snapshot).set(
                id,
                new Map(scope.snapshot.get(id)).set(liveAttribute, [false]),
              );
            scope.touched.add(id);
          }),
      });
    }
    try {
      const author = attribution(metadata.author);
      const origin = attribution(metadata.origin);
      const result = await work(Object.freeze({ entities: Object.freeze(txEntities) }));
      active();
      for (const actor of [author, origin])
        if (actor && !isLive(scope.snapshot.get(actor.id)))
          throw new Error('Attribution entity is unavailable');
      // Referential integrity is checked on the complete proposed state, allowing grouped deletion.
      for (const record of scope.snapshot.values()) {
        if (!isLive(record)) continue;
        for (const values of record.values())
          for (const value of values) {
            if (typeof value !== 'object' || !('ref' in value)) continue;
            const target = scope.snapshot.get(value.ref);
            if (!isLive(target) || recordType(target) !== value.type)
              throw new Error('Transaction would leave an unavailable reference');
          }
      }
      const facts = changes(base.current, scope.snapshot, scope.touched);
      scope.open = false;
      if (facts.length) {
        const commit: Commit = {
          id: crypto.randomUUID(),
          sequence: base.commits.length + 1,
          committedAt: Date.now(),
          schemaRevision,
          author,
          origin,
          facts,
        };
        issuance.sequence = commit.sequence;
        try {
          await persist(storage, base.generation, commit, () => {
            issuance.valid = true;
            publish(storage, base.generation, {
              schemas: base.schemas,
              commits: [...base.commits, commit],
              current: scope.snapshot,
            });
          });
        } catch (error) {
          if (error instanceof SaveError) completed = true;
          throw error;
        }
      }
      completed = true;
      return result;
    } finally {
      issuance.valid = completed;
      scope.open = false;
      scopes.delete(scope);
    }
  };

  const transactionRecord = (commit: Commit): RecordState => {
    const record = new Map<string, readonly Atom[]>([
      [typeAttribute, [transactionEntity.name]],
      [liveAttribute, [true]],
      ['@transaction/sequence', [commit.sequence]],
      ['@transaction/committedAt', [commit.committedAt]],
      ['@transaction/schemaRevision', [commit.schemaRevision]],
    ]);
    for (const key of ['author', 'origin'] as const) {
      const value = commit[key];
      if (value) record.set(`@transaction/${key}`, [{ ref: value.id, type: value.type }]);
    }
    return record;
  };
  const transactionObject = (
    commit: Commit,
    selection: unknown,
    querySequence = commit.sequence,
  ) => {
    const record = transactionRecord(commit);
    const snapshot = new Map(snapshotAt(storage, commit.sequence)).set(commit.id, record);
    const projected = project(
      context(snapshot, commit.sequence),
      transactionEntity,
      commit.id,
      record,
      selection,
    );
    // The transaction is a cursor in this history query; expanded actors retain their own cutoff.
    return materialize(
      { database: storage, id: commit.id, type: transactionEntity.name, sequence: querySequence },
      Object.fromEntries(Object.entries(projected)),
    );
  };
  const historyTransactions = async (input: QueryInput, first = false) => {
    ensure();
    const stored = readStorage(storage);
    const snapshot = new Map(stored.current);
    for (const [index, commit] of stored.commits.entries()) {
      if (index && index % 512 === 0) {
        await queryYield();
        ensure();
      }
      snapshot.set(commit.id, transactionRecord(commit));
    }
    const view = context(snapshot, stored.commits.length);
    const records = await selectRecords(view, transactionEntity, input, first);
    ensure();
    const commits = new Map(stored.commits.map((commit) => [commit.id, commit]));
    const result = [];
    for (const [index, [id]] of records.entries()) {
      if (index && index % 100 === 0) {
        await queryYield();
        ensure();
      }
      result.push(transactionObject(commits.get(id)!, input.select, stored.commits.length));
    }
    return result;
  };
  const historyEntities = Object.fromEntries(
    Object.entries(registry).map(([name, entity]) => {
      const query = async (input: ChangeInput, first = false) => {
        ensure();
        keys(
          object(input, 'History query'),
          ['select', 'where', 'orderBy', ...(first ? [] : ['limit'])],
          'history query option',
        );
        const selection = object(input.select, 'Change selection');
        keys(
          selection,
          ['sequence', 'entity', 'transaction', 'before', 'after'],
          'change selection',
        );
        const view = context(readStorage(storage).current, readStorage(storage).commits.length);
        for (const [key, value] of Object.entries(selection)) {
          if (key === 'before' || key === 'after') validateSelection(view, entity, value);
          else if (key === 'transaction') validateSelection(view, transactionEntity, value);
          else if (value !== true) throw new Error('Change scalar selection must be true');
        }
        const where = input.where ?? {};
        keys(
          object(where, 'History filter'),
          ['entity', 'transaction', 'sequence'],
          'history filter',
        );
        const entityId = where.entity
          ? identify(storage, where.entity.eq, entity.name).id
          : undefined;
        const transactionId = where.transaction ? commitFor(where.transaction.eq).id : undefined;
        const sequence =
          where.sequence === undefined ? {} : object(where.sequence, 'Sequence predicate');
        keys(sequence, ['eq', 'in', 'gte', 'lt'], 'sequence predicate');
        for (const [key, value] of Object.entries(sequence)) {
          if (key === 'in') {
            if (
              !Array.isArray(value) ||
              value.some((part) => typeof part !== 'number' || !Number.isSafeInteger(part))
            )
              throw new Error('Invalid sequence predicate');
          } else if (typeof value !== 'number' || !Number.isSafeInteger(value))
            throw new Error('Invalid sequence predicate');
        }
        const direction = input.orderBy?.[0]?.sequence ?? 'asc';
        if (
          input.orderBy !== undefined &&
          (!Array.isArray(input.orderBy) ||
            input.orderBy.length > 1 ||
            input.orderBy.some((part) => Object.keys(part).some((key) => key !== 'sequence')) ||
            !['asc', 'desc'].includes(direction))
        )
          throw new Error('History ordering supports one sequence direction');
        const take = first ? 1 : limit(input.limit);
        const found: object[] = [];
        const commits = transactionId
          ? readStorage(storage).commits.filter((commit) => commit.id === transactionId)
          : [...readStorage(storage).commits];
        if (direction === 'desc') commits.reverse();
        for (const [index, commit] of commits.entries()) {
          if (index && index % 32 === 0) {
            await queryYield();
            ensure();
          }
          if (found.length >= take) break;
          if (
            (transactionId && commit.id !== transactionId) ||
            ('eq' in sequence && commit.sequence !== sequence.eq) ||
            ('gte' in sequence && commit.sequence < (sequence.gte as number)) ||
            ('lt' in sequence && commit.sequence >= (sequence.lt as number)) ||
            ('in' in sequence && !(sequence.in as number[]).includes(commit.sequence))
          )
            continue;
          const ids = [...new Set(commit.facts.map((fact) => fact.entity))].filter((id) => {
            const record = view.snapshot.get(id);
            return record && recordType(record) === entity.name && (!entityId || id === entityId);
          });
          if (!ids.length) continue;
          const before = snapshotAt(storage, commit.sequence - 1);
          const after = snapshotAt(storage, commit.sequence);
          for (const [index, id] of ids.entries()) {
            if (index && index % 100 === 0) {
              await queryYield();
              ensure();
            }
            if (found.length >= take) break;
            const old = before.get(id);
            const next = after.get(id);
            const record = next?.has(typeAttribute) ? next : old;
            if (!record || recordType(record) !== entity.name || (entityId && id !== entityId))
              continue;
            found.push(
              Object.freeze(
                Object.fromEntries(
                  Object.entries(selection).map(([key, selected]) => {
                    if (key === 'sequence') return [key, commit.sequence];
                    if (key === 'entity')
                      return [
                        key,
                        materialize(
                          { database: storage, id, type: entity.name, sequence: commit.sequence },
                          {},
                        ),
                      ];
                    if (key === 'transaction') return [key, transactionObject(commit, selected)];
                    const selectedRecord = key === 'before' ? old : next;
                    return [
                      key,
                      isLive(selectedRecord)
                        ? project(
                            context(
                              key === 'before' ? before : after,
                              key === 'before' ? commit.sequence - 1 : commit.sequence,
                            ),
                            entity,
                            id,
                            selectedRecord,
                            selected,
                          )
                        : null,
                    ];
                  }),
                ),
              ),
            );
          }
        }
        return found;
      };
      return [
        name,
        Object.freeze({
          query,
          first: async (input: ChangeInput) => (await query(input, true))[0],
        }),
      ];
    }),
  );

  // Dynamic registry keys are validated at runtime; this is the single generic facade boundary.
  return Object.freeze({
    entities: Object.freeze(entities),
    refresh: async () => {
      ensure();
      await refreshStorage(storage);
      ensure();
    },
    transaction,
    history: Object.freeze({
      // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
      retainedStateReference: async (recorded: unknown, entity: unknown) => {
        ensure();
        return captureRetainedStateReference(storage, commitFor(recorded), entity);
      },
      // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
      resolveRetainedState: async (address: unknown) => {
        ensure();
        const resolved = resolveRetainedStateReference(storage, address);
        return Object.freeze({
          transaction: transactionObject(resolved.commit, {}),
          entity: resolved.entity,
          state: resolved.state,
        });
      },
      // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
      reference: async (recorded: unknown, entity: unknown) => {
        ensure();
        return captureReference(storage, commitFor(recorded), entity);
      },
      // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
      resolve: async (address: unknown) => {
        ensure();
        const resolved = resolveReference(storage, address);
        return Object.freeze({
          transaction: transactionObject(resolved.commit, {}),
          entity: resolved.entity,
        });
      },
      // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
      inspect: async (transaction: unknown, value: unknown) => {
        ensure();
        const commit = commitFor(transaction);
        const identity = identify(storage, value);
        const entity = Object.values(registry).find(
          (definition) => definition.name === identity.type,
        );
        if (!entity) throw new Error('Entity type is not registered');
        const snapshot = snapshotAt(storage, commit.sequence);
        const record = snapshot.get(identity.id);
        if (!isLive(record)) return;
        return Object.freeze({
          type: entity.name,
          values: project(
            context(snapshot, commit.sequence),
            entity,
            identity.id,
            record,
            allFields(entity),
          ),
        });
      },
      transactions: Object.freeze({
        // biome-ignore lint/suspicious/useAwait: Validation errors are promise rejections.
        get: async (value: unknown, options: { readonly select: unknown }) => {
          ensure();
          keys(object(options, 'Get options'), ['select'], 'get option');
          const commit = commitFor(value);
          validateSelection(
            context(snapshotAt(storage, commit.sequence), commit.sequence),
            transactionEntity,
            options.select,
          );
          return transactionObject(commit, options.select);
        },
        query: historyTransactions,
        first: async (input: QueryInput) => (await historyTransactions(input, true))[0],
      }),
      entities: Object.freeze(historyEntities),
      changes: async (value: unknown) => {
        ensure();
        commitFor(value);
        const groups = await Promise.all(
          Object.entries(registry).map(async ([name, entity]) => {
            const items = await historyEntities[name]!.query({
              where: { transaction: { eq: value } },
              limit: null, // A transaction receipt must include every change.
              select: { entity: true, before: allFields(entity), after: allFields(entity) },
            });
            return items.map((item) => Object.freeze({ type: name, ...item }));
          }),
        );
        return Object.freeze(groups.flat());
      },
    }),
    schema: Object.freeze({
      // biome-ignore lint/suspicious/useAwait: This async interface converts synchronous validation failures into promise rejections.
      revisions: async () => {
        ensure();
        return structuredClone(readStorage(storage).schemas);
      },
    }),
    at: (value: unknown) => {
      ensure();
      const commit = commitFor(value);
      return Object.freeze({
        entities: Object.freeze(
          readEntities(() => context(snapshotAt(storage, commit.sequence), commit.sequence)),
        ),
      });
    },
    subscribe: (listener: () => void) => {
      ensure();
      const unsubscribe = observe(storage, listener);
      subscriptions.add(unsubscribe);
      return () => {
        unsubscribe();
        subscriptions.delete(unsubscribe);
      };
    },
    [Symbol.asyncDispose]: () => {
      open = false;
      for (const scope of scopes) scope.open = false;
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
      return Promise.resolve();
    },
  }) as unknown as Database<R>;
}
