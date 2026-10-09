# Introduce the node model into the browser app

The target model is defined in [app/vault/nodes/model.ts](app/vault/nodes/model.ts); its semantics
and trade-offs are recorded in [ADR 0002](docs/adr/0002-versioned-node-model.md). This branch defines
the foundation. The current running app still uses its existing file model.

The next implementation should prove one complete browser interaction: two pages present one
paragraph, edits to the paragraph update both, removing one appearance leaves the other intact,
and transaction history reconstructs both pages as they were. Removing shared content must leave
explicit unavailable appearances; restoration must recover them. Use fictional data throughout.

## Where the current app needs to change

| Current location | Present behavior | Target behavior |
| --- | --- | --- |
| `app/vault/files.ts` | Path/text files and file changes | Node identities, complete versions, and transaction changes |
| `app/vault/changes/operations.ts` | Callers stage paths and text | Callers calculate node changes from an owned snapshot |
| `app/vault/changes/writer.ts` | Persisted overlay and source blob hashes | Node-keyed staging, expected versions, atomic transaction publication |
| `app/vault/documents/notes/` | Markdown/YAML parsing and path-derived identity | Typed JSON content and node-based reading/rendering rules |
| `app/vault/documents/graph.ts` | Derived notes, backlinks, and relations | Derived containment, incoming targets, closures, and projections |
| `app/vault/index.ts` | Live file interface bound outside render | Live node snapshot and operations, independent of storage and React views |
| `app/vault/storage/backend.ts` | File head, checked file writes, Git-style history | Adapter contract for ordered transaction history and atomic append |
| `app/vault/storage/github/` | Git tree, encrypted blobs, file overlay | Optional transport encoding of node records and transactions |
| `app/vault/session/` | Unlocking, cache encryption, refresh | Reuse the session guarantees with the chosen node-storage adapter |
| `app/product.tsx` | Composes workflow dependencies and note search | Composes the node-backed vault, reader routes, and search projections |
| `app/workflows/chat/` | Reads/writes Markdown and appends capture files | Typed node operations and recorded conversation content |
| `app/workflows/rename-note/` | Move files and rewrite references | Edit display content while retaining node identity |
| `app/workflows/history/` | Git commit summaries, text patches, revert | Transactions, changed node states, historical closures, compensating transactions |
| `app/preview/` | Fictional Markdown files and scripted agent | Fictional node history and the same node-backed product views |
| `tools/check.ts` | Permanent file/schema/link checks | Structural record validation and application content rules |

Maintain the documented dependency direction: the vault owns data integrity, workflows own user
actions, and Product composes workflows. Keep the node model independent of Markdown, React, Git
hashes, IndexedDB keys, and backend row layouts.

## 1. Implement snapshots and transactions in memory

Start beside `model.ts` in `app/vault/nodes/`. Provide snapshot lookup, ordered children, target
resolution, closure traversal, node history, and an atomic transaction operation through a small
module interface. Type the initial page, paragraph, and appearance JSON at the application layer.
Validate imported JSON at runtime; TypeScript readonly fields do not enforce runtime immutability.
Copy or freeze accepted content so later caller mutation cannot rewrite history.

Build indexes for latest versions, children by parent, and incoming targets. Treat them as derived
state; committed node versions are authoritative. Preserve selected deletion versions to distinguish
deleted targets from identities not yet present. Use one snapshot cutoff for every traversal.
Choose an insertion-friendly order-key algorithm and a deterministic tie rule before implementing
reordering. An order key orders children; it does not link them to neighboring node identities.

Separate uncommitted edits from NodeVersion records. A staged change contains a proposed complete
node state and its expected last transaction ID; committed transaction IDs and sequences are assigned
when the group is accepted. Fold repeated staged edits to the same node into one final version.
Track read dependencies when a calculation depends on nodes beyond the changed set.

Completion: transaction tests demonstrate shared edits, independent edits, reorder, move, appearance
removal, target deletion/restoration, container deletion/restoration, historical traversal, and
atomic conflict rejection. Assert the identities receiving new versions, not just rendered results.
Also check foreign keys, duplicate versions, invalid placement, containment cycles, recursive
inclusion behavior, and changes to separate nodes proceeding without false conflicts.

## 2. Connect a browser slice

Add a page/block workflow, wired in Product, that receives the node interface. Render two pages
using the public kit, including missing shared content. Expose explicit actions for editing shared
content, making one appearance independent, removing an appearance, and deleting shared content.
The selected appearance is the identity used for placement actions; the resolved content node is
the identity used for shared edits. Keep selection and unconfirmed form drafts in view state.

Bind the live node interface above route selection, following the current `liveVault()` pattern.
Views subscribe to current projections, while asynchronous actions read through the owned snapshot.
Invalidate affected read projections without creating versions of roots or dependants. Distinguish
membership closure (deduplicated identities) from rendering occurrences (every appearance).

Supply fictional nodes and history through the preview bootstrap. Add a transaction history view
that can inspect previous closures. Undo records compensating versions for changed nodes and checks
that intervening changes are not overwritten. Restoring a container alone reveals its descendants'
current states; exact historical reconstruction uses a snapshot cutoff.

Completion: the browser demonstrates the shared-paragraph scenario with no Markdown document
serialization, and model tests plus focused browser checks confirm current and historical behavior.

## 3. Select and implement durable storage

Decide where authoritative transactions live before enabling durable writes. The existing
`vault-github` IndexedDB stores are an encrypted cache and can be cleared; they must not become
the sole copy of committed node history by accident. A local-only durable store and a synchronized
remote store have different offline-write and ordering requirements.

Define the storage seam around atomic transaction acceptance and ordered history. Start with the
memory implementation used by the browser slice; add the selected durable adapter when its storage
and synchronization semantics are settled. Allocate definitive transaction sequence under shared
authority. Preserve transaction identity for retry deduplication and verify stale expectations at
the actual write base, including remote writers. Publish cache projections only after the complete
transaction is available.

For a relational adapter, `NodeVersion` has primary key `(nodeId, transactionId)` and foreign keys
to Node and Transaction; parent and target reference Node. Index transaction sequence, per-node
history, and current parent/target projections. Retain tombstones and identity records. For a GitHub
adapter, serialize these same records as JSON through an atomic commit; keep Git SHA and transport
paths private to the adapter. Adapter choice must not change the application records.

Reuse encrypted storage, write ownership, cross-tab notification, cancellation, and staged-review
guarantees where they apply. Offline staging can remain provisional until a definitive committed
sequence is available; offline committed writes across devices require a separate ordering decision.

Completion: restart/offline reads preserve history, concurrent tabs and remote writers retain
atomicity, retries do not duplicate transactions, and sign-out follows the agreed storage policy.

## 4. Migrate application consumers and existing content

Move search, route identity, agent tools, captures, and History onto node snapshots and transactions.
Define their JSON shapes and validators as those consumers are migrated. Permanent content rules
remain in the vault so deleting a workflow cannot weaken stored-data integrity.

Existing Markdown is a legacy input. A one-time migration can allocate identities, map references,
and create initial node transactions; ongoing Markdown support is outside this model. Decide whether
to preserve old Git history as an archive or translate it before migrating real data. Validate the
mapping and closures against fictional fixtures, then review a complete migration result before
changing the private vault. Existing file behavior remains usable until its replacement is verified.

Completion: the application reads and writes the shared node model across workflows, existing content
has a reviewed migration path, and obsolete file APIs and permanent Markdown rules can be removed.
