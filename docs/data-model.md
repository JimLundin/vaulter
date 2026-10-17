# Target data model: typed EAV

Status: migration in progress. This specification consolidates the target agreed in
[ADR 0010](adr/0010-typed-eav-engine.md) and [ADR 0011](adr/0011-chat-agent-eav-adoption.md),
including continuous dialogue, context checkpoints and History. It distinguishes implemented
contracts from the preservation requirements that still gate migration of other modules.
[GLOSSARY.md](../GLOSSARY.md) defines the domain vocabulary. The executable definitions linked
below are authoritative for currently registered attribute names, types and optionality.

## Storage and identity

The target is one Vault of typed entities, relationships and immutable transaction history.
Entity–attribute–value facts are the engine's physical representation; application modules use
schema-defined entity objects, not arbitrary string attributes or JSON copies of Node payloads.

| Concept | Contract |
|---|---|
| Entity | Opaque stable identity with a registered type; content equality never establishes identity. |
| Attribute | Persisted definition with a stable key, scalar/JSON/reference/set type and optionality. Renaming a property can retain its key; changing meaning requires migration. |
| Reference | An engine-validated entity reference of the declared type. Projections and object spread retain identity; JSON and structured clones do not. |
| Inverse reference | A derived, read-only view of a forward reference, without duplicate stored edges. |
| Transaction | An atomic accepted group of net assertions/retractions, with sequence, acceptance time, schema revision and optional author/origin references. |
| Snapshot | The state after one accepted transaction. References resolve within that snapshot. |
| History | Accepted transactions, complete entity before/after projections and snapshots, independent of installed execution providers. |

Supported values are strings, finite numbers, booleans, date-times, enums, JSON, references and
sets. JSON is reserved for retained provider payloads, external evidence and extensible settings;
relationships that need integrity or queries use references. Sets are unordered and deduplicated.
Sequence-sensitive records carry explicit positions. Optional absence, an empty set and an explicit
value are distinct; `clear` removes an optional attribute, while `undefined` is not a stored value.

The typed engine exposes `openDatabase({ schema, storage })`, `entities.<type>.get/query/first`,
`transaction(context?, callback)`, `history.transactions`, `history.entities`, `history.changes`,
`history.inspect(transaction, entity)` and `at(transaction)`. Generic inspection resolves an
entity's type and attributes at that historical cutoff, including transaction attribution.
A later edit or deletion cannot rename an author in an earlier History entry.
See the [engine contract](../app/vault/eav/README.md) for query, identity and lifetime details.

Transactions expose insert/update/delete and read their pending changes. Only successful callbacks
publish. Invalid writes, throws and conflicts abort the whole transaction; callback code is never
automatically retried. Current acceptance conservatively rejects any intervening publication.
The transaction lifetime ends before model/network execution, streaming or tool effects begin.

Live EAV references require live targets; deletion is restricted while such references remain.
This differs from Node's retained links to tombstones. Migration of shared content must settle
an explicit unavailable-content representation before transferring those references. Retaining
history does not by itself make a deleted entity a valid live reference.

## Shared attribution and Agent records — implemented

Definitions: [Actor](../app/vault/records/actor.ts) and
[Agent schema](../app/agent/data/schema.ts).

| Entity | Required attributes and relationships | Optional retained information |
|---|---|---|
| Actor | name; kind: user, agent or system | — |
| ActorBinding | integration key; Actor | Keys bind the caller's configured identity, not its display name. |
| ToolDefinition | name; version | — |
| Agent | Actor; provider; model; instructions; settings; ToolDefinition set | Editable configuration; earlier runs retain what they actually used. |
| AgentRun | Agent; author Actor; startedAt; status; provider; requestedModel; instructions; settings | endedAt, servedModel, request, finish reason, timings, token/usage/cost metadata, output, error |
| RunTool | AgentRun; accepted tool name and version | Independent of later ToolDefinition edits. |
| ContextInput | AgentRun; position; role; transformation; content | Effective supplied content, retained independently of its source. |
| ModelStep | AgentRun; position; startedAt; status; inputFormat; input; configuration | endedAt, response, error |
| ToolExecution | RunTool; position; call; attempt; startedAt; status; input | issuing ModelStep, endedAt, elapsedMs, output, error |

AgentRun status is running/complete/failed/stopped/interrupted. ModelStep status is
running/complete/failed/stopped. ToolExecution status is running/complete/failed/cancelled.
ContextInput role is system/user/assistant/tool; transformation is
verbatim/selection/summary/truncation/generated. Status records observed facts; absence of a local
controller cannot establish whether a remote owner remains active.

A text ModelStep retains its accepted request before provider execution and its response before the
next request. Its current `inputFormat` is `ai-sdk-model-messages-v7`: application-level AI SDK
messages, not a raw HTTP capture. SDK/provider-internal attempts remain unknown. Opaque external
execution retains known run-level facts without fabricating ModelSteps. Credentials and transport
authentication headers never enter these records.

Tool invocation and outcome are canonical Agent records. Tool side effects have their own owner
and acceptance boundary. Stop expires further execution but preserves accepted effects and receipts.
A failed save retains the exact publication for persistence-only retry, without rerunning the model
or tool. Reading, reloading and browsing history never resume execution.

## Chat records — implemented

Definitions: [Chat schema](../app/workflows/chat/data/schema.ts).

There is exactly one native Conversation per Vault. Topic changes, dates and device preferences do
not create another conversation or routing scope. The engine does not declare a uniqueness
constraint for this: Chat's transactional operations enforce the invariant under atomic conflict
checks. A submission key deduplicates admission; it is not an entity ID or a queued execution job.

| Entity | Required attributes and relationships | Optional retained information |
|---|---|---|
| Conversation | createdAt | One native identity per Vault. |
| Exchange | Conversation; position | startedAt, submission key, AgentRun |
| Message | Exchange; author Actor; at; text | input metadata, including capture provenance |
| InputSource | ContextInput; Message | Connects supplied context to its submitted source. |
| RetainedSource | Exchange; position; speaker; occurredAt; provenance | date precision, text, activity, label, known status |
| Migration | key; sourceSequence | One-time importer bookkeeping. |
| ContextCheckpoint | through Exchange; covered Exchange set; fingerprint; generating AgentRun; createdAt; title; summary | — |
| RunContext | AgentRun; selected Exchange set | selected ContextCheckpoint |

Messages are canonical submitted user words. Agent output and tool outcomes are projected from
Agent records; Chat does not save a second assistant-message or tool-result copy. An AgentRun can
exist independently of Chat. Exchange positions order the dialogue and ContextInput positions order
the supplied model context; neither is the database transaction sequence.

RetainedSource preserves imported contributions whose original execution records are unavailable.
Speaker is user/agent/unknown. Known completion status, old grouping, source text and exact immutable
Node versions remain provenance; missing model requests, authors or outcomes stay absent. Historical
contributions are presented by their recorded instant, then original placement and identity.
Day-only evidence remains day-only; ties and uncertain dates do not acquire invented precision.
Earlier containers are provenance, not new dialogue boundaries.

Context checkpoints are explicit, attributed summaries of a fixed dialogue prefix, created by a
separate tool-free AgentRun. The generating run retains the exact selected evidence. Future runs
use the furthest applicable checkpoint, subsequent exchanges and current instructions. RunContext
records that selection; ContextInputs record exactly what was supplied. Changing covered evidence
invalidates checkpoint applicability without deleting the checkpoint or original conversation.
An incomplete outcome completed later therefore invalidates the earlier summary's coverage.

The Timeline navigates exchanges and checkpoints in the same Conversation. Navigation does not
select a different run context, discard drafts or trigger execution. The recorded
`readConversationHistory` tool retrieves source activity by position without replay. Automatic
checkpoint scheduling, context budgets and bounded tool-result projections remain unimplemented.

## History — core application utility

History belongs to core Transactions and is opened as an application action, alongside Settings.
It is not a workflow destination. Its shared drawer overlays the current page without changing the
route or replacing the current draft. Search and the `g y` shortcut open that same drawer. Existing
`/history/` links open it over Chat; closing such a direct link returns to Chat. The shared kit owns
responsive geometry, scrolling, dismissal, focus, grouped surfaces and expandable rows.

History presents accepted EAV and remaining Node transactions in one list, grouped by recording date.
Each entry keeps its own store identity and sequence. Recorded timestamps order the combined presentation, with stable
ties; there is no shared sequence, atomic snapshot or causal ordering across the two journals.
Pagination preserves transaction identities as new activity arrives. Loading metadata scans the
retained journals; only the selected page's before/after records are reconstructed. Indexing and
bounded cold-history loading remain future performance work.

EAV entries include historical author/origin labels and entity/attribute changes, including removed
optional values, reference retargets and deletion. No author is invented for unattributed bootstrap
transactions. Generic inspection uses persisted types and attributes, without importing Chat or Agent
into the History owner. Expanded entries use shared labelled metadata and before/after diff components.
The list shows up to 100 changed entities (or legacy detail lines) per expanded entry and reports additional
changes; the database history API retains the complete change set.

Existing content compensation remains an explicit, confirmed, guarded Node transaction. EAV dialogue
and execution entries have no generic Undo action. A future content compensation implementation must
preserve transcript, execution and exact-source evidence, reject intervening changes, and append
compensation rather than rewriting accepted history.

## Native Wiki — implemented

[ADR 0012](adr/0012-native-eav-wiki.md) adopts the [knowledge-model proposal](research/knowledge-model-proposal.md).
Wiki production reads and writes use typed EAV [owner definitions](../app/workflows/wiki/data/schema.ts):
WikiPage, Content, Appearance and PageReference. Prose remains prose; a selected assertion does not
require a duplicate Claim entity. Pages may serve as Subjects, and Graph separately owns explicit
Topic promotion and editorial membership. Creating a page never automatically creates a Topic.

Content owns typed text and formatting. Appearances own ordered placement and share one content
identity. Removal retains availability and history; restoration reveals current descendant content.
Native [SourceDocument](../app/vault/sources/schema.ts) records retain captured text and provenance.
[Evidence records](../app/vault/evidence/schema.ts) retain exact body/summary/source selectors,
attributed reviews and supporting or challenging passages. EAV historical-reference fields validate
accepted targets and durable replay. Partial coverage leaves unselected clauses unsupported;
page provenance cannot mark summaries supported. Changed selected text requires review, while
source edits and deletion preserve historical passages. Support and disagreement remain independent.

Application composes these schemas once with the other EAV owners. Native Wiki tooling, Chat tools,
production reading, Search and the fictional preview use this model. Source-vault conversion and
identity correspondence remain a separate preservation procedure; opening Wiki reads only native
accepted entities and does not convert or erase published records. Qualified structured assertions,
whole-assertion selectors and the full cross-domain Evidence review screen remain subsequent work.

## Remaining content migration — required preservation contracts

The remaining producers and source-vault conversion must preserve the contracts below.
Native Wiki content, selected evidence and Topic organization are implemented above; other owner
schemas remain migration work. Exact entity names and field layouts
must be settled with each owning module before registering and publishing its schema.

| Area | Target EAV relationships and invariants |
|---|---|
| Content and containment | Independently addressable content; separate placement/order and shared appearances. Editing a child or moving a placement must not version ancestors or descendants. Multiple appearances share one content identity. |
| Relationships and Graph | Named typed connections retain source/target identity and direction. Graph remains a projection of owner records, not a competing canonical copy. Cycles in ordinary relationships are allowed; containment remains acyclic. |
| Wiki pages and Subjects | Distilled knowledge retains page/section structure, Subject associations and source provenance. Other retained material remains evidence rather than automatically becoming a Wiki page. |
| Citations and page references | Claim and evidence must preserve exact historical content, the selected snapshot, projection format and half-open UTF-16 ranges. Page-wide provenance remains distinct from statement support. Only eligible underlying source material supports citations. |
| Questions and Answers | Questions retain their Subject, prompt, attribution and open/answered/abandoned state. Answer evidence and its link are accepted atomically; subsequent edits/deletion cannot erase the originally recorded answer. |
| Observations and Interpretations | Retain measured/described time separately from recording time, source provenance, uncertainty and attribution. Later interpretations or corrections coexist with original evidence. |
| Independent live voice | Migrate its producer to the same Agent and Chat entities while preserving effective context, finalized speech, stop/close, tool declarations and persistence-only recovery. The independent compatibility voice runtime still uses Nodes. |

EAV now exports validated snapshot evidence through `history.reference` and restores opaque handles
through `history.resolve`. The versioned address survives durable storage reopen and retains entity
identity/type, journal identity and an accepted snapshot; nested references resolve at that cutoff,
even after later deletion. This is a snapshot address, not an exact entity-change transaction pair.
Native Wiki adds schema-defined historical-reference fields with acceptance-time integrity,
owner-defined projection formats, passage ranges and explicit content availability. Other evidence
owners must retain these guarantees when migrating; a serialized address alone is insufficient.
Do not replace exact Node addresses with live EAV references or unvalidated JSON strings.
Existing [citation rules](adr/0005-wiki-citation-selections.md)
and historical availability obligations remain binding during this transition.

## Persistence and rollout

Production EAV publishes immutable transaction envelopes, including schema revisions, under
`.vaulter/eav/transactions/` in the private Vault repository. Git ref compare-and-swap acceptance
preserves unrelated Node and content paths. A plaintext IndexedDB cache supports offline reads;
writes require remote acceptance. Session replacement, credential changes and sign-out cover both
stores; sign-out clears device data while retaining remote history.

Chat's one-time importer retains exact Node evidence, and normal Chat reads then use EAV.
Unmigrated content tools still require Node authors, origins and citation endpoints. Immutable
`externalRecord` run backlinks and message excerpts bridge that requirement, with their own save
recovery. These are compatibility evidence, not a second dialogue/execution authority. There is no
cross-store atomic transaction.

Continue migration by transferring an owner's schema, producer, reads, history/source projections
and recovery together. Verify re-opened data and failed/uncertain-save recovery using fictional
persistence. Keep imported source identities and original history resolvable. Retire a compatibility
seam only after every caller and exact evidence reference has a supported replacement. No reset,
regeneration of published history or destructive in-place conversion is part of this specification.

The application migration is complete when all production producers and readers use EAV, retained
Node evidence still resolves, the bridges are unnecessary, and focused persistence/recovery checks
plus the implementation commit's full CI verification pass. History adoption and historical-address
export/resolution are implemented; source-vault conversion, qualified structured knowledge and independent voice migration remain.

## Native Questions

[ADR 0013](adr/0013-native-eav-questions.md) adopts `questions.question`, `questions.context` and
`questions.answer` in the application EAV registry. Context records retain historical subject,
source, knowledge and review addresses without duplicating their owners' identities. A person’s
Answer records the exact Question version and changes its state atomically. Original response
text and author remain readable in EAV history after subsequent edits or removal. The
Questions view observes this collection in both Questions and subject pages. Questions uses EAV
exclusively for reading, writing, evidence and attribution.
