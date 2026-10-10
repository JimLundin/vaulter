# Version nodes with child-owned placement

Vaulter's application data uses one node representation, independently of backend representation
and Markdown. Nodes have stable identities; immutable node versions hold complete JSON content,
a grouped version key, optional placement, and an optional connection. Transactions group the versions published together.
This places content edits, moves, and removal on the affected node instead of producing versions
of its ancestors, siblings, or dependants. The records are defined in
[model.ts](../../app/vault/nodes/model.ts).

The expected write locality is:

| Operation on an existing structure | Nodes receiving versions |
| --- | --- |
| Edit shared paragraph content | The paragraph |
| Move or reorder one appearance | The appearance |
| Remove one appearance | The appearance |
| Move a container with descendants | The container |
| Remove a container with descendants | The container |
| Delete or restore shared content | The shared content |
| Make one appearance independent | New content and the retargeted appearance |

## Identity and history

`Node.id` anchors identity, including after deletion. `Transaction.id` anchors a recorded operation;
its unique sequence orders committed history within a vault. The timestamp describes when the
transaction was recorded. A node address holds `node` and an optional `transaction`. A version's `key` uses that same
shape with transaction required; its composite primary key is `(node, transaction)` and both
components are foreign keys. A transaction records at most one version per node. Versions store complete
states and remain immutable. Undo and restoration create new transactions.

A snapshot at sequence S selects each node's latest version whose transaction sequence is at or
before S. An identity with no version at S is not yet present. A selected version with `data: null`
is deleted. Identity addresses (without transaction) resolve in that snapshot. Exact addresses select the
record with that composite key; they never treat transaction as a cutoff or fall back to another
version. A snapshot cannot resolve exact versions recorded after its cutoff. An exact root version
does not freeze its children: containment and identity endpoints still resolve in the viewing
snapshot. Reconstructing an entire historical page or conversation requires selecting its snapshot.
A content edit therefore needs one new version, even when many nodes reference that content. History is linear; branching and
merging histories would require revisiting transaction ordering.

## Content and structure

`data` holds arbitrary nested JSON objects. Node types and application behavior interpret this JSON.
`placement` and `connection` are model-aware structural values. A string inside JSON is not
automatically a structural reference. A placement contains `parent` (an identity foreign key) and
`order` (a sortable sibling key); null means unplaced. Containment is acyclic. Parents' children
are derived from the selected child versions.

A connection contains `source` and `target` addresses. Either endpoint may identify a node or an
exact version. Placement says where the relationship node appears; source says what it relates
from. These may share an identity but remain independent: moving a citation does not change the
claim it supports. Connections remain embedded values of ordinary nodes, not independent records.
The base model gives each version at most one placement and one connection. Several relationships
or appearances use several nodes. No children list or separate joining table is necessary.

Version keys, placements, connections and addresses are grouped because their fields express one
value. SQL can flatten these fixed single values into columns on a version row. Identity endpoint
references use node foreign keys; endpoints with transactions additionally use composite version
foreign keys. Generic data stays JSON. Memory/Dexie validate equivalent integrity at acceptance.

An appearance owns its placement and connects its enclosing page to a shared content identity.
Shared content is held once;
each placement has its own identity. Editing shared content changes what every appearance displays
while creating only one content version. Moving or removing an appearance changes only that
appearance. Editing one appearance independently creates new content and retargets that appearance
in one transaction. These are two deliberate changes, with no propagation through the graph.

Order keys allow ordinary insertion and movement without renumbering siblings. The key-generation
algorithm remains an implementation choice: some algorithms occasionally need rebalancing. The
implementation must use a consistent lexicographic comparison and define how equal keys are ordered.

## Deletion, references, and closure

Deletion appends a version with `data: null`. Node identities and earlier versions remain. Structural
fields on deleted versions do not participate in traversal; deletion operations may clear them.
Foreign keys remain valid when their target identity is deleted in the current snapshot. Identity references distinguish available content, deleted content, and identities
that have no version yet. Exact references retain their addressed record through later changes and
tombstones. An unknown identity or exact version pair is an integrity error.

Removing one placement deletes the appearance. Deleting shared content deletes the target node.
Its appearances remain and present an explicit deleted-content placeholder. They resume displaying
content if the target is restored. This retains placement and keeps deletion local; it replaces
the earlier proposed policy of refusing deletion while appearances exist.

A root's closure follows selected live child nodes and connection targets in the viewing snapshot.
Connection sources are inspectable endpoints, not reverse inclusion paths. Exact targets may
contribute an older live version even when the identity's currently selected version is deleted.
Traversal stops at absent or deleted nodes. References to deleted targets can be reported separately
for presentation; a selected tombstone is not a live member. A visited set keyed by
`(node, transaction)` prevents repeated traversal without collapsing different versions of one
identity.
Containment cycles are invalid; application rules must also handle recursive content inclusion
without rejecting harmless cross-references merely because they form a cycle.

Deleting a container removes it and nodes reached solely through it from that root's closure.
Descendants receive no deletion versions, keep their parent identities, and are not promoted to a
new parent. Another surviving path can still reach them. Restoring the container reveals reachable
descendants at their current versions; viewing the historical closure instead uses their versions
at that historical transaction. Reachability and existence are separate. Automatic garbage
collection of unreachable identities would require a separate decision because history and
restoration depend on retaining them.

## Transaction application

There is one persisted `Transaction` definition for every feature. It records identity, definitive
sequence, acceptance time, required `recordedBy`, an extensible operation `kind`, and nullable
`message`, `origin`, and `undoOf`. The write request derives these fields from
Transaction; it adds proposed changes and expectations, while the store assigns sequence and time.
There is no separate RecordedTransaction or feature-specific transaction record.

`recordedBy` references the stable Node identity of the author: a user, agent, or system. It means
who produced the change, not which database adapter wrote it. `origin` references a context
Node, such as an exchange, import, or automation run; direct actions can have no origin. Attribution
comes from trusted writer context and cannot be chosen by arbitrary agent-tool arguments. Initial
transactions can create their own author node atomically. Both references remain valid after their
nodes are deleted; historical attribution resolves them at the selected transaction cutoff.

Kinds are structured `{ scope, action }` values from a typed operation catalogue. Each scope
specifies its allowed actions; feature modules extend the catalogue and expose named operation
constants. Callers use `nodeOperations.move` or `chatOperations.submit`, without parsing dotted
strings or using unrestricted string fallback types. Storage validates the two nonempty fields;
feature schemas validate registered operation semantics on external input. Matching is by field
values so deserialized kinds work. Readers can display unknown well-formed future kinds without
pretending their feature behavior is available.

`Transaction<Metadata>` supports optional typed JSON metadata. Accepted metadata is immutable and
part of retry identity. This is recorded context, not independently editable state. New optional
payload fields can be added through feature schemas without another transaction representation.
Unknown metadata is retained. New required fields or changed meanings need explicit decoding and
migration; generics do not perform migrations. References requiring integrity checks belong in
explicit model fields or reference nodes, rather than hiding in metadata strings.

The agent author can be the same stable agent node presented in the wiki. Its name, instructions,
and configuration are versioned payload/children, not a second author record. A particular run is
an origin context. The writer supplies the authenticated/owned author identity; a wiki presentation
alone is not an authentication or permission check. Attribution at a historical cutoff resolves
the author's historical node version.

The write operation validates the complete proposed snapshot, then publishes new identities,
the transaction, and its node versions atomically. It checks unique composite keys, known identity and exact-version foreign
keys (including new versions in the same transaction), valid JSON (including finite numbers), placement, and containment rules. It permits references
to deleted identities and children whose parent has been deleted. JSON shape and inclusion behavior
are validated by the applicable node-type rules. Creating an identity records its initial live
version in the same transaction; edits, deletion, and restoration reuse that identity.

Stale-write expectations belong to the write request, separately from immutable versions. An
expected transaction ID identifies the last version seen for each changed node; creation expects
no existing identity. Decisions based on other nodes also need their relevant read dependencies
checked. Conflict rejects the whole transaction. Definitive sequence allocation and remote writers
must be coordinated by the selected storage adapter, not by client timestamps.

## Alternatives and trade-offs

Embedded parent children lists would make placement edits version the parent and could force
rewrites of siblings. Independent relationship nodes would put each placement change on a separate
edge instead of the placed node. A general array of references would obscure the single-parent
placement rule that provides locality. Transactions as nodes add self-membership bookkeeping
without a current application need; transactions therefore remain separate records.

Placement and one connection per node are intentionally narrower than an arbitrary array of edges. Nodes
with multiple placements use appearances; nodes with multiple references use reference children.
Deleting shared content has a broad visible effect with a local stored change. A database foreign
key verifies identity existence; snapshot availability and presentation remain application rules.

The node model and storage are available alongside the current file workflows.
[Node storage](../node-storage.md) describes the application interface and next integration slice.

## Citations and append-only records

Appending a version changes the selected state of an identity without editing any prior record.
A citation can address exact claim and evidence versions and keep a range in its data; creating it
requires no source rewrite, advance segmentation, or duplicate quote. Feature rules define the
text projection and validate the selection. Comparing each exact endpoint with its identity in the
viewing snapshot yields a newer-version or deleted notice without recording another citation
version. A newer version alone does not prove that the selected text or claim's meaning changed.
Composite referential integrity proves existence, not that the source supports the claim.

Chat circumstances and agent provenance use typed observation, run, input, tool and interpretation
nodes. Collection results have their own observation and receipt times. Late enrichment and
corrections create new identities with exact subject/evidence/correction references; they do not
version the exchange or its ancestors. Original facts and interpretations remain recorded. The
metadata writer validates feature payloads and creation expectations; the generic node store
retains its existing versioning rules. [Chat metadata](../chat-metadata.md) describes the shapes
and collection interface. Collection settings govern future collection, not removal of history.

The [captured spike](https://github.com/JimLundin/vaulter/tree/33a77c4) exercised these grouped
keys and exact endpoints. Production storage retains the model without its standalone demo.
