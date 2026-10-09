# Version nodes with child-owned placement

Vaulter's application data uses one node representation, independently of backend representation
and Markdown. Nodes have stable identities; immutable node versions hold complete JSON content,
a parent, an optional target, and an order key. Transactions group the versions published together.
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
transaction was recorded. A node version's composite primary key is `(node, transaction)`;
both are foreign keys. A transaction records at most one version per node. Versions store complete
states and remain immutable. Undo and restoration create new transactions.

A snapshot at sequence S selects each node's latest version whose transaction sequence is at or
before S. An identity with no version at S is not yet present. A selected version with `data: null`
is deleted. Every parent and target lookup uses that same snapshot. A content edit therefore needs
one new version, even when many nodes reference that content. History is linear; branching and
merging histories would require revisiting transaction ordering.

## Content and structure

`data` holds arbitrary nested JSON objects. Node types and application behavior interpret this JSON.
`parent` and `target` are model-aware foreign keys to stable Node identities. A string
inside JSON is not automatically a structural reference. `order` orders a node among children
of its parent. A live placed node has a parent and an order key; a live unplaced node has neither.
Containment is acyclic. Parents' children are derived from the selected child versions.

The base model gives each node one placement and at most one target. Several references can be
represented by several child nodes with targets. No independent edge record or stored children
list is necessary. The same representation covers direct content, containers, appearances, and
references; application-level data shapes define their specific behavior.

An appearance owns its placement and targets a shared content node. Shared content is held once;
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
Foreign keys remain valid when their target identity is deleted in the current snapshot. The app
distinguishes available content, deleted content, and identities that have no version yet. An
unknown identity is an integrity error.

Removing one placement deletes the appearance. Deleting shared content deletes the target node.
Its appearances remain and present an explicit deleted-content placeholder. They resume displaying
content if the target is restored. This retains placement and keeps deletion local; it replaces
the earlier proposed policy of refusing deletion while appearances exist.

A root's live closure is the set reachable through selected live child nodes and target references.
Traversal stops at absent or deleted nodes. References to deleted targets can be reported separately
for presentation; a deleted node is not a live member. A visited set prevents repeated traversal.
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
the transaction, and its node versions atomically. It checks unique composite keys, known foreign
keys, valid JSON (including finite numbers), placement, and containment rules. It permits references
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

Parent and target fields are intentionally narrower than an arbitrary graph of named edges. Nodes
with multiple placements use appearances; nodes with multiple references use reference children.
Deleting shared content has a broad visible effect with a local stored change. A database foreign
key verifies identity existence; snapshot availability and presentation remain application rules.

The current app still reads and writes Markdown files. This is the accepted target model; the
[implementation plan](../../PLAN-node-data-model.md) describes how to introduce it into the app.
