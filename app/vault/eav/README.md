# EAV engine

The standalone engine exposes typed entity objects over entity–attribute–value facts. Its public
interface is `index.ts`. It has no dependency on the existing Node model or application workflows.
`createMemoryStorage()` retains a database across handles within one process. For durable storage,
`createPersistentStorage(adapter)` supplies an atomic journal adapter. Production Chat uses the
GitHub adapter in `app/vault/storage/eav`, with a plaintext IndexedDB cache for offline reads.
The application is adopting EAV one producer at a time; see ADR 0011.

```ts
import { e, openDatabase, createMemoryStorage } from './index.ts';

const Conversation = e.entity('conversation', { title: e.string() });
const Message = e.entity('message', {
  conversation: e.ref(Conversation),
  text: e.string(),
  sentAt: e.datetime(),
});
const schema = e.registry({ conversations: Conversation, messages: Message });
const storage = createMemoryStorage();

await using db = await openDatabase({ schema, storage });
const conversation = await db.transaction((tx) =>
  tx.entities.conversations.insert({ title: 'Travel' }),
);
await db.transaction((tx) => tx.entities.messages.insert({
  conversation, text: 'Pack a raincoat', sentAt: new Date(),
}));

const latest = await db.entities.messages.first({
  where: { conversation: { eq: conversation } },
  select: { text: true, conversation: { title: true } },
  orderBy: [{ sentAt: 'desc' }],
});

if (latest) {
  await db.transaction((tx) =>
    tx.entities.messages.update({ ...latest, text: 'Pack two raincoats' }),
  );
}
```

## Queries and identity

`get(entity, { select })` loads a specific entity object from the selected snapshot, returning
`undefined` if it is absent. It preserves hidden identity and validates foreign/wrong-type handles.
`query(options)` returns a collection; `first(options)` returns its first member or `undefined`.
Both apply filters and ordering before projecting the result. `first` owns its one-result limit;
passing `limit` to it is rejected. It does not assert uniqueness. Without ordering, the first result
is chosen by stable internal identity, not insertion or relevance. Equal sort values also use that
internal identity as the tie breaker.

`select` determines the inferred result fields. Selecting a reference with `true` yields an opaque
entity reference; a nested selection expands its attributes. Every projection, including `{}` and
nested references, implicitly retains identity. Entity equality is `sameEntity(a, b)`; identical
field values can belong to different entities. The engine never compares entity JSON for identity.

An enumerable private symbol carries an engine-issued token. Object spread and object rest retain
it, while string keys and JSON contain only selected fields. An ordinary object, a raw string, a
detached JSON/structured clone, an object of another type, or one from another storage backend cannot
identify an entity in a write. Identity is validated at runtime as well as through TypeScript.
Objects retain their identity across handles on the same storage backend. This is not an
authentication mechanism. Historical evidence has a separate validated export/import interface below.

Read objects and collection values are frozen. Dates are detached Date values: mutating a returned
Date cannot mutate retained data. Attribute changes persist only when explicitly submitted to a
transaction. Update accepts a partial or full writable object, preserving omitted attributes;
delete uses only the object's identity. Existing entity objects are not valid creation data.
Use `clear` to remove an optional attribute; `undefined` is not a persisted value or a clear command.
Sets accept arrays, deduplicate their members, and have deterministic value order rather than
insertion order. Replacing a set computes membership assertions/retractions. Empty optional sets
remain distinguishable from absent attributes in historical snapshots.

Filters support scalar equality, membership, numeric/date ranges, string containment, `and`, `or`,
and `not`. Reference equality accepts an entity object, and `matches` follows the referenced entity.
Set predicates use `some`. Query options and selected fields are validated even on empty databases.
Selections and predicates are limited to 64 nested levels to reject recursive input objects.

Reverse references can be named without storing a duplicate relationship:

```ts
const schema = e.registry({
  conversations: Conversation.extend({ messages: e.inverse(Message, 'conversation') }),
  messages: Message,
});
```

The inverse can be selected and filtered with `some`. It is read-only; omit derived fields from an
update patch. The target of an inverse must have a reference back to the declaring type.

`after: previousResult` provides pagination with implicit identity. A cursor must come from the same
snapshot; a newer committed transaction invalidates a live-view cursor. Use `db.at(transaction)` for
a fixed historical view when paginating across concurrent changes. Ordering and filters must remain
the same across pages. This implementation scans candidates; indexes and a query planner are future
performance work, not a guarantee of the current interface.

## Transactions and lifetime

The callback receives the same readers plus `insert`, `update`, and `delete`. Reads see its pending
writes. Other handles see only accepted data. A successful callback publishes one atomic transaction
before its result resolves. Throws, invalid writes (even if caught by the callback), and conflicts
abort all changes. Callback code is never automatically retried. The handle is closed before
publication notifications, so escaped transaction references cannot admit more writes.

The memory backend uses conservative serializable acceptance: any intervening database publication
rejects a transaction that has changes. It may reject independent changes rather than merging them.
Objects read before a later change to that entity cannot overwrite it; obtain a current projection
and calculate a new patch. References used only as identities do not assert that their attributes
are unchanged. Make decisions requiring consistent data through the transaction's readers.

Live references must resolve to live entities of the declared type. Deleting a referenced entity
requires removing or deleting its live inbound references in the same transaction. There is no
implicit cascade. Historical snapshots preserve the earlier relationships. This initial engine
does not yet offer retained dangling-reference policies or restoration of deleted identities.

Closing the database stops new operations and invalidates uncommitted scopes without waiting for
arbitrary callback work. Objects issued during a transaction receive its accepted revision on
success, or become invalid if it aborts. Disposal does not clear the storage backend. Subscribers
are notified after publication; their exceptions cannot change the acceptance result.

## History and schema

```ts
const transaction = await db.history.transactions.first({
  select: { sequence: true, committedAt: true, schemaRevision: true },
  orderBy: [{ sequence: 'desc' }],
});
if (transaction) {
  const past = db.at(transaction);
  const changes = await db.history.changes(transaction);
  const messageChange = await db.history.entities.messages.first({
    where: { transaction: { eq: transaction } },
    select: {
      before: { text: true, conversation: { title: true } },
      after: { text: true, conversation: { title: true } },
    },
  });
}
```

Transaction records have hidden identities too: pass the returned object to `at` or history filters.
Their sequence establishes committed order. Optional `author` and `origin` accept entity references
in `db.transaction({ author, origin }, callback)`; authentication is the caller's responsibility.
Transaction history exposes these as opaque references because their entity type is not fixed by
the engine. Before/after changes resolve references in their respective historical snapshots.
Creation has `before: null`, deletion has `after: null`. Cross-type changes form a discriminated
union on the registry key. History exposes net changes; intermediate writes, read-only transactions,
and changes that cancel out do not create a committed data transaction.

Schemas use strings, finite numbers, booleans, valid Dates, string enums, JSON values, references, and sets,
with optional attributes. They produce serializable definitions, retained as numbered revisions.
Type names and attribute identities beginning with `@` are reserved for the engine; attribute names
`and`, `or`, and `not` are reserved by the predicate interface. Reference declarations must agree
with the registered target's fields, while the registered type may add fields through `extend`.
Each committed transaction records its schema revision. `db.schema.revisions()` returns detached
definitions. `storage.inspect()` additionally exposes diagnostic facts and transaction records;
it remains available when opening with an incompatible schema fails.

Entity type names and attribute keys are stable identities. Attribute keys default to `type/name`;
`.key('stable-key')` permits a public property rename without losing its data. Registry access names
are application aliases. Compatible additions include new types, optional attributes, and inverse
references. Removing definitions, changing value types, reference targets, cardinality or enum
values, or introducing required attributes requires explicit migration and is rejected at open.
An older open handle becomes invalid when the schema revision changes. Historical values are read
through compatible current definitions; incompatible migrations and version-specific decoding
are deliberately not guessed or implemented by this first backend.

`e.json()` retains a detached, deeply frozen JSON value. It rejects cycles, sparse arrays, undefined,
non-finite numbers, class instances, getters and symbols (including entity identity). Object key order
does not affect equality; array order and duplicates are preserved. JSON supports whole-value equality
and membership, not nested projections or ordering. Relationships remain typed references.

Facts store individual asserted/retracted values, with internal type, existence and empty-set
presence attributes. Historical views reconstruct them from accepted transactions. First open and
history reads are not bounded for large datasets. Checkpoints, indexed reads,
incompatible schema migrations and broader application adoption need subsequent work.

## Historical evidence references

`history.reference(transaction, entity)` exports a frozen `HistoricalReference` for a live entity
in that accepted snapshot. Its versioned format retains the storage scope, first journal transaction,
selected transaction, entity identity and type. JSON serialization preserves the address.
`history.resolve(unknown)` validates those fields, journal membership and target availability,
then returns opaque `transaction` and `entity` handles for `at` and `history.inspect`:

```ts
const address = await db.history.reference(transaction, message);
const evidence = await db.history.resolve(JSON.parse(JSON.stringify(address)));
const retained = await db.history.inspect(evidence.transaction, evidence.entity);
```

The address selects state at a snapshot cutoff, including nested references, rather than requiring
the entity itself to change in that transaction. Later edits and deletion cannot change that state.
Unknown transactions, entities not yet created or deleted at the cutoff, wrong types, foreign scopes
and different journals are rejected. Unaccepted inserts cannot be exported. Durable adapters must
retain a stable scope across reopen; memory scopes last for the reused storage object.

Resolution reads available accepted history and never refreshes, publishes or executes effects.
Refresh explicitly when remote evidence is newer than the loaded journal. The address is neither
an authorization token nor a live typed reference. Schema fields for historical references,
acceptance-time integrity for stored evidence, text projection formats and passage ranges remain
content-migration work; merely storing this address in JSON does not enforce those contracts.

## Verification

`npm run test:fast -- app/vault/eav` exercises the public interface. `contract.type-test.ts` is checked
by `npm run typecheck` and includes valid and rejected call sites, including `first` absence handling.
Full routine verification runs in CI under the repository testing policy.

## Durable acceptance

A storage adapter loads an immutable journal and atomically appends a request against its recorded
base. The GitHub adapter retains full schema revisions with each transaction, validates replay,
verifies blob hashes and uses non-forced ref updates. It reconciles repeated requests and lost
acceptance responses before reporting success. Existing files and accepted journal paths are preserved.
`refresh()` synchronizes the handle; transactions refresh before capturing their snapshot.

The callback runs once. On uncertain publication, `SaveError.retry()` resubmits that exact request
and resolves only after acceptance; it does not rerun the callback or return its original result.
Objects allocated by that pending publication retain identity, but remain absent from readers until
accepted. A rejected/conflicting callback still invalidates its newly allocated objects. Retain any
application result needed for recovery and query accepted state after retry. A conflicting request
requires a new calculation against current state, never automatic replay of effects.

The owner closes persistent storage with `closeStorage(storage)` when its session ends and calls
`clearStorage(storage)` to remove its rebuildable device cache on sign-out. Closing an individual
`await using db` handle does not discard shared storage. The production credential getter supplies the
current token without changing storage identity or retaining credentials in records.

`history.inspect(transaction, entity)` supports generic History tooling: it returns the registered
entity type and all writable attribute values at that transaction, or `undefined` if the entity
is absent there. It validates both handles against the database, retains opaque identity and resolves
references in that snapshot. Later edits or deletion cannot change this historical projection.
See the [target application model](../../../docs/data-model.md) for adoption status.
