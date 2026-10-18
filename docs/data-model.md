# Data model: typed EAV

All application owners use the single EAV journal under [ADR 0014](adr/0014-eav-only-vault.md).
This specification consolidates the typed engine and owner contracts, including continuous dialogue,
context checkpoints, historical evidence and independent voice.
[GLOSSARY.md](../GLOSSARY.md) defines the domain vocabulary. The executable definitions linked
below are authoritative for currently registered attribute names, types and optionality.

## Storage and identity

The model is one Vault of typed entities, relationships and immutable transaction history.
Entity–attribute–value facts are the engine's physical representation; application modules use
schema-defined entity objects with declared attributes and relationships.

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
See the [engine contract](../app/application/store/README.md) for query, identity and lifetime details.

Transactions expose insert/update/delete and read their pending changes. Only successful callbacks
publish. Invalid writes, throws and conflicts abort the whole transaction; callback code is never
automatically retried. Current acceptance conservatively rejects any intervening publication.
The transaction lifetime ends before model/network execution, streaming or tool effects begin.

Live references require live targets; deletion is restricted while such references remain.
Wiki content uses explicit availability to retain shared placements through removal and restoration.
Historical references independently retain accepted evidence after later edits or deletion.

## Shared attribution and Agent records — implemented

Definitions: [Actor](../app/actors/actor.ts) and
[Agent schema](../app/agent/records.ts).

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

Definitions: [Chat schema](../app/conversation/records.ts).

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
| ContextCheckpoint | through Exchange; covered Exchange set; fingerprint; generating AgentRun; createdAt; title; summary | — |
| RunContext | AgentRun; selected Exchange set | selected ContextCheckpoint |

Messages are canonical submitted user words. Agent output and tool outcomes are projected from
Agent records; Chat does not save a second assistant-message or tool-result copy. An AgentRun can
exist independently of Chat. Exchange positions order the dialogue and ContextInput positions order
the supplied model context; neither is the database transaction sequence.

RetainedSource preserves imported contributions whose original execution records are unavailable.
Speaker is user/agent/unknown. Known completion status, old grouping, source text and retained source provenance remain available; missing model requests, authors or outcomes stay absent. Historical
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

History presents accepted EAV transactions grouped by recording date. The single journal sequence
retains acceptance order. Pagination preserves transaction identities as new activity arrives; only
the selected page's before/after records are reconstructed. Cold history loading and indexed scans
remain future performance work.

Entries include historical author/origin labels and entity/attribute changes, including removed
optional values, reference retargets and deletion. Generic inspection reads persisted definitions
without importing workflows. Expanded entries use shared metadata and before/after diffs and report
omitted entities when a presentation limit is reached; the history API retains complete changes.
No author is invented for unattributed bootstrap transactions. Generic compensation remains future
owner work and must append changes while preserving transcript, execution and source evidence.

## Native Wiki — implemented

[ADR 0012](adr/0012-native-eav-wiki.md) adopts the [knowledge-model proposal](research/knowledge-model-proposal.md).
Wiki production reads and writes use typed EAV [owner definitions](../app/wiki/records.ts):
WikiPage, Content, Appearance and PageReference. Prose remains prose; a selected assertion does not
require a duplicate Claim entity. Pages may serve as Subjects, and Graph separately owns explicit
Topic promotion and editorial membership. Creating a page never automatically creates a Topic.

Content owns typed text and formatting. Appearances own ordered placement and share one content
identity. Removal retains availability and history; restoration reveals current descendant content.
Native [SourceDocument](../app/sources/records.ts) records retain captured text and provenance.
[Evidence records](../app/wiki/reviews/records.ts) retain exact body/summary/source selectors,
attributed reviews and supporting or challenging passages. EAV historical-reference fields validate
accepted targets and durable replay. Partial coverage leaves unselected clauses unsupported;
page provenance cannot mark summaries supported. Changed selected text requires review, while
source edits and deletion preserve historical passages. Support and disagreement remain independent.

Application composes these schemas once with the other EAV owners. Native Wiki tooling, Chat tools,
production reading, Search and the fictional preview use this model. Source-vault conversion and
identity correspondence remain a separate preservation procedure; opening Wiki reads only native
accepted entities and does not convert or erase published records. Qualified structured assertions,
whole-assertion selectors and the full cross-domain Evidence review screen remain subsequent work.

## Native Graph and independent voice

Graph owns explicit broad Topics, editorial memberships, named directed relationships and vocabulary.
Its typed historical endpoints retain source/target meaning at accepted snapshots. Graph projects owner
records for exploration; it does not become a duplicate content authority. Ordinary relationship cycles
are permitted while containment remains acyclic. Wiki receives Graph interpretation through Application.

Independent voice produces the same Agent configuration, runs, effective inputs, observed model activity
and canonical tool outcomes as text execution. It retains finalized speech and provider metadata actually
observed. Stop/close prevents further execution and failed saves retain exact persistence-only recovery.
Opaque providers do not acquire invented internal request receipts.

## Historical evidence and persistence

`history.reference` exports validated snapshot evidence and `history.resolve` restores opaque handles.
References retain identity/type, journal identity and an accepted snapshot; nested references resolve
at that cutoff after later edits or deletion. Schema-defined historical-reference attributes validate
acceptance and durable replay. Source owners define text projections and selection ranges under
[ADR 0005](adr/0005-wiki-citation-selections.md).

Production publishes immutable transaction envelopes and schema revisions under
`.vaulter/eav/transactions/` in the private repository. Git ref compare-and-swap establishes remote
acceptance and preserves unrelated paths. A plaintext IndexedDB cache supports offline reads;
writes require remote acceptance. Session replacement, credential changes and sign-out manage this
one journal. Sign-out clears device records while retaining remote history.

Private source translation, identity mapping and verified publication remain outside application startup
under ADR 0007. The application has one authoritative store and no automatic source conversion.
Focused owner checks establish persistence/recovery behavior; the exact implementation commit's CI
establishes complete routine verification. Qualified structured knowledge, shared honest effective-time
contracts, interpreted events and a full cross-domain Evidence review screen remain future owner work.

## Native Questions

[ADR 0013](adr/0013-native-eav-questions.md) adopts `questions.question`, `questions.context` and
`questions.answer` in the application EAV registry. Context records retain historical subject,
source, knowledge and review addresses without duplicating their owners' identities. A person’s
Answer records the exact Question version and changes its state atomically. Original response
text and author remain readable in EAV history after subsequent edits or removal. The
Questions view observes this collection in both Questions and subject pages. Questions uses EAV
exclusively for reading, writing, evidence and attribution.
