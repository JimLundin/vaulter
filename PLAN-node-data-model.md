# Node storage for agent chat and History

Build storage for the existing agent chat and History workflows using the
[node records](app/vault/nodes/model.ts) and semantics in
[ADR 0002](docs/adr/0002-versioned-node-model.md). This is an implementation sketch. The running
application still uses files; the branch defines the node foundation.

The first browser slice is the existing chat: record an exchange, run node-based agent tools against
reviewed staging, commit a content change, and inspect or undo it through History. Use fictional
preview content. A page editor can follow once these workflows exercise the storage.

## Current behavior and proposed scope

`conversation.ts` owns live turns, SDK messages, capture position, and draft in memory. It survives
route changes but not reload. `record.ts` persists explicitly captured text and metadata by appending
to a Markdown day log. Agent tools read, stage, check, and commit files. A turn owns the writer across
its tool sequence. History lists app Git commits, file patches, and guarded revert.

Retain reviewed staging, ownership, cancellation, and failed-edit recovery while replacing durable
files with nodes and transactions. The working assumption is to retain every submitted exchange,
including read-only and stopped responses. Capture-only retention can use the same records and
change when they are first written. The existing app only persists explicitly captured exchanges.

## Structure: conversation, exchanges, messages, and references

```text
Conversation
  Exchange 1
    User message
    Assistant response
    Topic reference --> Subject node
    Place reference --> Place node
  Exchange 2
    User message
    Assistant response
```

All entries use Node/NodeVersion. Exchanges own their parent and order within the conversation;
messages own theirs within the exchange. Appending a message does not version any ancestor.
References are children of the exchange with an explicit targetNodeId; JSON identifies their role.
Several topic or place references use several nodes.

Illustrative application payloads, to be typed and validated during implementation:

```ts
// Conversation
{ kind: 'conversation', title: 'Studio plans', createdAt: '...' }

// Exchange
{
  kind: 'exchange', startedAt: '...',
  context: { device: { form: 'phone' }, weather: { description: 'Clear' } },
  capture: { procedure: 'capture', summary: 'Leave more time for the studio.' },
}

// User message
{ kind: 'message', role: 'user', at: '...', parts: [{ kind: 'text', text: '...' }] }

// Assistant response
{
  kind: 'message', role: 'agent', at: '...', status: 'complete',
  parts: [
    { kind: 'text', text: '...' },
    { kind: 'tool', callId: '...', name: 'readNode', input: {}, output: {} },
  ],
  model: '...', tokens: { in: 1200, out: 80 },
}

// Reference: the actual subject ID is its targetNodeId.
{ kind: 'reference', role: 'topic' }
```

Keep text/tool parts together in one message's JSON: they currently share identity and lifecycle.
Normalize SDK output into valid JSON, including errors and omission of undefined values. IDs inside
recorded tool arguments are audit payload, not structural references traversed by the node model.
Store ordinary text without serializing Markdown documents; formatted model-output presentation is
separate from the node persistence format.

The app records verbatim messages; capture supplies classification and reference children instead
of retyping the transcript. Daily conversation views are projections over exchange timestamps.
If a capture covers several exchanges, give it a node with reference children targeting those
exchanges, preserving message placement and avoiding copies.

Composer draft, voice partials before submission, focus, unread state, suggestion cache, and active
request handles remain runtime state. Stored messages can reconstruct validated SDK model history
on reload. A recorded running response without a live owner becomes interrupted; it does not
automatically resume agent tools. New Chat creates a root on its first accepted Send and preserves
the earlier conversation.

## A turn contains several short transactions

Writer ownership can span a model run; a database transaction must not remain open during network
streaming. Chat-record writes and content staging use separate scopes in the same node store.

| Workflow point | Versions recorded |
| --- | --- |
| First accepted Send | New conversation, exchange, user message, assistant placeholder |
| Later accepted Send | New exchange, user message, assistant placeholder |
| Text and tool deltas | Runtime response; optional bounded checkpoints of that response |
| Capture tool | Classification/reference changes staged with curated content |
| Commit tool | Complete versions of the explicitly staged content/capture changes |
| Response completes | Assistant response with final text, results, model, and usage |
| Stop or failure | Assistant response with retained partial text and terminal status |
| Retry | A new response attempt beneath the existing exchange |

Check the exact reviewed staging under ownership before accepting Send. Record the submission before
starting the model request; persistence failure prevents that request. Capture-only retention would
instead create transcript nodes when a capture is committed.

Checkpoints are a durability/volume choice, not one transaction per token. Without checkpoints, a
crash retains the request and placeholder but loses unrecorded response text. A content commit can
finish before the assistant's response: retain that boundary, then record final response content in
a later transaction. Before staging capture classification, capture can record the transcript seen
so far as a chat checkpoint. Keep this separate from the content transaction so its audit record
survives content undo.

Stop expires the tool handle and waits for in-flight writes to settle. Then the controller records
a terminal response through an authorized storage operation, without reviving cancelled tools.
A successful content commit remains committed; failed/stopped content staging stays available for
review. Recording chat status must neither commit nor discard unrelated staging. Surface failure
to save the terminal response separately from failure of the model run.

## Storage and staging interface sketch

```ts
type NodeChange = Omit<NodeVersion, 'transactionId'>;

type TransactionRequest = {
  id: TransactionId; // allocated once, retained across retries
  changes: readonly NodeChange[];
  expected: Readonly<Record<NodeId, TransactionId | null>>;
  details: {
    message: string;
    kind: 'chat' | 'content' | 'undo';
    originNodeId: NodeId | null;
    undoOfTransactionId: TransactionId | null;
  };
};

type RecordedTransaction = {
  transaction: Transaction;
  nodes: readonly Node[]; // new identities, each with its initial version
  versions: readonly NodeVersion[];
};

interface NodeStorage {
  read(afterSequence?: number): Promise<readonly RecordedTransaction[]>;
  append(request: TransactionRequest): Promise<RecordedTransaction>;
}
```

This is a proposed seam, not an implemented contract. History needs persistent transaction details
for message, kind, originating exchange, and undo source. Those would extend Transaction with
explicit fields: originNodeId is an optional FK to Node and undoOfTransactionId an optional FK to
Transaction. Update Transaction alongside this request when accepting the application contract;
the current foundation does not yet include those details.

Append checks expectations, assigns definitive sequence/time, creates identities, attaches its
transaction ID to proposed complete states, and atomically publishes all records. A null expectation
means a new identity; a deleted identity still has a last transaction ID. Check relevant read
dependencies too. New identities in the same group can satisfy foreign keys. Replaying an accepted
request ID returns its original acceptance; using that ID with different contents fails.

One node module above storage projects snapshots, ordered children, target availability, closures,
node history, and transaction differences. Bind its live interface above routes, following
liveVault(); async tools calculate against an owned snapshot. Stage complete proposed states by
node ID and retain the original expected version while repeated edits replace the proposal. Each
commit includes only its explicit staging scope. Accepted JSON must be copied/frozen so callers
cannot mutate history. Choose insertion-friendly order keys and deterministic equal-key ordering.

## History and undo

History reads the same recorded transactions. Default the existing History view to content and undo
transactions, so chat acceptance/checkpoint/completion writes do not bury content edits. Chat views
derive their transcript from conversation nodes. These are projections of one history.

Show complete before/after node state, including parent, target, order, data, and deletion. Find the
prior version strictly before the selected transaction's sequence. Text-only patches miss moves and
reference changes. Keep the existing History layout while replacing Git-specific paths and SHA labels.

Undo appends compensating versions of the selected affected nodes. Restore their prior complete
states; nodes introduced by the original operation receive deletion versions. Check their current
versions against the operation being undone and reject the whole group on intervening changes.
Validate the resulting structure and retain identities/history.

Preserve transcript audit records when undoing curated content: transcript/checkpoint writes belong
to chat transactions, while classification/reference and curated changes belong to content
transactions. Undo compensates the content transaction. If capture-only retention creates transcript
nodes in that same transaction, its reviewed undo set must explicitly preserve those audit records.
Record the actual compensation set rather than claiming every version was reversed.

Link content transactions to their originating exchange through transaction metadata, avoiding a
new exchange version every time a tool commits. History can inspect that transcript at the content
transaction's cutoff or show its subsequently completed response as a separate current view.

## Durable storage proposal

Reuse the configured private GitHub repository as a possible first remote transport. Store each
immutable transaction envelope as JSON in a dedicated namespace: transaction, new identities, and
complete node versions. Transport paths and Git hashes stay private to the adapter. A successful
atomic Git ref update publishes the envelope.

Validate against authoritative history and assign sequence there. On a fast-forward race, reload,
check whether this request already committed, then return that acceptance or revalidate before
retrying. Browser Web Locks coordinate tabs on one origin, not other devices or remote writers.

The current GitHub backend filters vault files and invokes Markdown checks; it needs a node-aware
adapter. Reuse the Git client, atomic commit mechanics, encryption, and coordination where suitable.
Use encrypted IndexedDB transaction/projection caches and separate persisted staging. The cache
remains rebuildable from remote history; it must not accidentally become the sole durable copy.

Initially support cached historical reads and offline staging. Cross-device offline committed
transactions need a separate ordering decision; do not report a chat as durably saved if append
fails offline. A browser-only durable store is another option, with different sign-out/retention
semantics. Remote transport selection remains open and does not affect the application records.
Measure envelope growth, paginate history, and plan checkpoints or another adapter as usage grows.

## Implementation sequence and application locations

1. **Memory storage and projections:** app/vault/nodes/. Implement append, staging, immutable
   snapshots, expected versions, reference availability, ordering, differences, and retry handling.
   Verify single-node edits, ancestor-free appends, deletion/restoration, historical closures,
   atomic conflicts, and independent writes.
2. **Existing chat:** app/workflows/chat/{conversation,record,tools,context,suggestions}.ts and
   app/product.tsx. Persist accepted messages, adapt capture and node tools, preserve reviewed
   staging/ownership/cancellation, and use structured fictional fixtures in app/preview/.
   Read/create/update/delete/move/reference tools replace whole-file tools. Preserve rename behavior
   as a display-content edit with stable identity.
3. **Existing History:** app/workflows/history/. List transaction details, show complete state
   changes, inspect historical snapshots, and append guarded compensation. Cover content committed
   before a stopped reply and transcripts retained after content undo.
4. **Durable adapter:** app/vault/storage/ and app/vault/session/. Settle transport, encrypt
   cache/staging, implement remote ordering and retries, cross-tab refresh, and restart recovery.
   Keep the legacy file namespace usable during transition.
5. **Existing content and rules:** app/vault/documents/, validation/, and tools/check.ts. Define
   typed JSON content/vocabulary required by the agent, review a one-time Markdown migration, and
   decide how old Git history is retained. Change agent conventions together with its tool inputs.
   Remove obsolete file interfaces only after their consumers have migrated.

Completion: the existing chat and History use one node store, reload retains recorded exchanges,
appending messages does not version ancestors, Stop preserves committed content, and undo records
compensation without erasing the transcript. A new page editor is not required.
