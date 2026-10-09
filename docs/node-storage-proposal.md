# Chat payloads and browser node storage

Use [chat.ts](../app/vault/documents/chat.ts) for application payloads and
[model.ts](../app/vault/nodes/model.ts) for their backing records. NodeVersion is generic over its
JSON data; the default remains arbitrary JSON objects. Parent, target, identity, and transaction
remain outside that JSON. The application schemas constrain conversation, exchange, message, and
reference payloads without introducing a separate persistence model for each feature.

The proposed operations are defined in [store.ts](../app/vault/nodes/store.ts). The throwaway
[storage spike](../app/vault/nodes/spike/README.md) implements this contract with Maps and encrypted
Dexie, and exercises chat/History scenarios. Production integration
is still pending; the running app and its current cache are unchanged.

## Memory and persistence

JavaScript Maps are sufficient for a volatile store used by tests and preview. IndexedDB is local
persistent browser storage, retained across reload; it is not in-memory storage or cross-device
synchronization. Use the same NodeStore interface with a memory implementation and an IndexedDB
implementation. Views and agent tools consume that interface, keeping database mechanics private.

For the IndexedDB implementation, use Dexie. This model needs compound keys, indexes, typed table
operations, atomic multi-table writes, and migrations preserving data. Dexie provides those with
less cursor/transaction plumbing. The smaller idb library is suitable if retaining the native
IndexedDB interface is preferred; idb-keyval is too narrow for this history model.

The existing app/vault/session/idb.ts helper creates simple named stores and recreates most stores
on upgrade. It is appropriate for the existing cache but should not govern retained node history
unchanged. The node store needs explicit data-preserving migrations. Dexie does not enforce foreign
keys: commit still validates Node identity references and all node-model invariants.

## Operations callers use

NodeStore.commit receives complete proposed states and expected last transaction IDs, plus a stable
request ID and History details. It returns only after acceptance. For example:

```ts
const snapshot = await store.snapshot();
const message = snapshot.get(messageId);
if (!message || message.data === null) throw new Error('Message is unavailable');

await store.commit({
  id: crypto.randomUUID(),
  message: 'Record the completed reply',
  kind: 'chat.response.complete',
  recordedBy: agentNodeId,
  originNodeId: message.parentNodeId,
  undoOfTransactionId: null,
  changes: [{
    nodeId: message.nodeId,
    expectedTransactionId: message.transactionId,
    parentNodeId: message.parentNodeId,
    targetNodeId: message.targetNodeId,
    orderKey: message.orderKey,
    data: completedReply,
  }],
});
```

The same operation records new identities with expectedTransactionId: null. Tombstones and restored
nodes expect their last recorded version. snapshot(sequence) provides an immutable historical view;
snapshot() captures current state once. Parent and target resolution stay within it. children(parent)
returns ordered live children and is empty when the parent is absent/deleted. A selected deleted
target is distinguishable from a node without a version at that snapshot.

history paginates recorded transactions, optionally filtering kind. changes(transactionId) provides
complete before/after node states for History. subscribe notifies callers to reload projections
after commits. A later content write module adds reviewable staging and guarded undo over this store;
those do not belong in the raw database tables.

Transaction is the single persisted definition in model.ts. It includes required recordedBy (an
author Node identity), an extensible kind, optional message, originNodeId (context Node), and
undoOfTransactionId, alongside identity, order and acceptance time. NodeCommit derives from it and
adds proposed changes and expectations; it is a write request, not a second stored shape.

The writer context supplies recordedBy, not untrusted tool arguments. A user submission records
the user; agent output/content changes record the agent and reference their exchange as origin.
A direct user move has no origin. Imports and automations can record system authors and reference
import/run nodes. Actors and context use the same versioned Node model as all other data.

Kinds name operations specifically: chat.submit, chat.response.complete, chat.response.stop,
node.update, node.move, node.delete, node.restore, import.apply, transaction.undo. New features
can introduce kinds without changing a storage enum. History can filter a set of kinds and retain
unknown operations using their message or kind as a label.

A domain transaction is one logical change group; a Dexie/IndexedDB transaction is the short
storage operation used to publish that group atomically. Neither stays open across a model request.

## Logical IndexedDB layout

For a plaintext development store, the suggested tables and indexes are:

```ts
db.version(1).stores({
  nodes: 'id',
  transactions: 'id, &sequence, [kind+sequence], recordedBy, originNodeId',
  versions: '[nodeId+transactionId], transactionId, nodeId, [nodeId+sequence]',
  current: 'nodeId, parentNodeId, targetNodeId, data.kind',
});
```

The version row adds sequence as a storage-level index field copied from its transaction. It is
derived, not another application-level version identifier. A composite tuple is the version key.
Current rows contain the latest version and are rebuildable projections; update changed rows only.
Ordering by orderKey and nodeId can happen after the indexed parent query. IndexedDB excludes null
keys from indexes, so roots are not retrieved through parentNodeId = null; use identity or type
queries for roots. This schema is illustrative and does not install a plaintext store in the app.

A commit runs in one readwrite transaction spanning these tables:

1. Check retry ID, expected node heads, and any read dependencies against current rows.
2. Validate the proposed snapshot, known identities, JSON payloads, placement, and containment.
3. Allocate the next unique sequence under the same transaction's ownership.
4. Add new identities, the recorded transaction, and immutable versions.
5. Replace only the changed current rows, then publish notifications after successful commit.

Validate recordedBy and originNodeId as Node identity references, including identities created in
the same transaction. Deleted actors/contexts retain their identities and historical attribution.

Failure aborts all steps. Reuse of a retry ID with different contents fails; implementing that check
requires retaining the normalized accepted request or its digest as private storage metadata. Never
edit historical version rows. The memory adapter performs the same validation on a temporary state
and swaps it into place only when the whole operation succeeds. Snapshot Maps are copied/protected
against caller mutation rather than exposing the writable store.

## Existing encryption and synchronization

The current app encrypts content on-device. Dexie is not encryption; the production adapter must
retain that behavior. Encrypt version content and structural parent/target/order data at rest;
plaintext indexes reveal structure and must be a deliberate choice. One practical approach is to
store encrypted records indexed only by opaque IDs and transaction sequence, then derive children,
targets, and type indexes in memory after unlock. The plaintext schema above illustrates logical
queries, not the proposed encrypted physical format.

Perform Web Crypto/network work outside a live IndexedDB transaction. Prepare encrypted records,
then recheck expected heads inside the short write transaction before inserting the group. Async
work unrelated to IndexedDB can let its transaction auto-close. Sequence allocation and preparation
must coordinate without weakening conflict validation; if preparation used a changed head, retry.

If remote GitHub history remains authoritative, apply accepted remote records to IndexedDB as one
group. A successful local cache write is not a successful remote commit. Locally staged changes and
pending synchronization need distinct status. Browser-owned authoritative history instead supports
local commits but needs a separate synchronization, backup, and sign-out retention decision. Dexie
alone does not settle that choice, and its optional cloud product is not required for this proposal.

## Library references

- [Dexie documentation](https://dexie.org/docs/): typed tables, compound indexes, transactions,
  migrations, and observable queries. Use Dexie within the storage adapter; the existing controller
  subscription interface can remain above it without adding Dexie hooks to workflow views.
- [idb documentation](https://github.com/jakearchibald/idb): a thinner promise-based wrapper with
  typed schemas and transaction completion promises. Its transaction-lifetime section describes
  why network/crypto work must occur outside database transactions.

The spike verified local changes, historical snapshots, guarded undo, stale-write and read-dependency
rejection, retry deduplication, encrypted records, upgrade retention, and concurrent writers using
Maps and Dexie with fake-indexeddb. Chrome verified the standalone demo and persistence through a
full page reload. Production implementation still needs bounded reads, session-key integration,
workflow wiring, and a synchronization/retention policy; see the spike verdict.
