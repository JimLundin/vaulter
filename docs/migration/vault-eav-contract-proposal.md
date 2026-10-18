# Proposed contracts and implementation order

Status: proposed for discussion, with V01's product direction and a dedicated
Tasks module with a Kanban board agreed on 2026-10-18.
The initial board uses fixed Backlog, Ready, In progress and Done columns;
configurable statuses and boards are deferred.
Decisions is also agreed as a dedicated module with a global list page and
embedded presentation, retaining decision text, civil date, optional rationale
and revision history without implying continued applicability.
Observations is agreed as an owner of structured retained records and embeddable
presentation, with no standalone measurements page in the initial scope.
No field schema is agreed and no migration is claimed complete.
This proposal responds to [the feedback](vault-eav-feedback.md), its
[exact gap contracts](vault-eav-gap-contracts.md), and the
[Observation supplement](vault-eav-observations.md).

The feedback branch is `feedback/vault-eav-migration-20261018`. Implementation
should first incorporate current `main` (`12678e1`), which includes the module
ownership reorganisation. Paths below refer to that layout. Inspection found no
open GitHub Issues on 2026-10-18; these documents remain the request source.

## Common contract

Each owner exposes retained definitions, validated transactional admission, and
current/historical reading through its public entry. Admission accepts an existing
Transaction so related owner changes can publish atomically. Application composes
definitions and cross-owner presentation; the private translator supplies source
correspondence. Owners do not parse old vault formats or assign conversion credit.

Retain one native identity per original identity, with revisions at their selected
native snapshots. Keep exact source identity/version/provenance separately from
native acceptance time and Transaction author/origin. An unavailable record retains
its final fields; ordinary current reading filters it, and historical inspection
can return it. Identical text or URLs never establish identity correspondence.

Use explicit positions for ordered members, never unordered sets. Relationships
use validated references, not identifiers hidden in JSON. JSON can retain raw
external payloads, but typed owner projections must interpret the fields callers
need. Optional omission means unrecorded; an explicit unknown state means the
record asserts uncertainty. Recorded null remains distinct from both. Unsupported
source values produce an admission error rather than silent normalization.

Time values preserve exact source expression, recorded precision and supplied
offset/timezone. Do not pad a day or minute to a purported exact instant. Calendar
owns civil-date and time interpretation; extend its existing value contract for
minute/second precision and explicit unknown/null timing before other owners reuse
it. Import/conversion time is never occurrence, completion or capture time.

## Contracts by request

| Request | Proposed owner and retained shape | Required behavior |
| --- | --- | --- |
| V01 | Agreed product direction: private tooling processes old conversations into the current ongoing dialogue. Sources retains old notes as external source material, including original versions and structure needed for provenance. Conversation gains no legacy conversation/exchange grouping types. | Converted contributions use current Conversation semantics. References to an original container select its preserved external source state rather than an arbitrary converted contribution. Source-to-native correspondence remains explicit. Source capture/admission time is distinct from original dialogue time. The Sources field/selection contract remains to be designed. |
| V02 Tasks | Agreed basis: dedicated Tasks domain and routable presentation, comparable to Calendar, with fixed Backlog, Ready, In progress and Done columns. Retain task text, optional civil due date, availability and provenance. Configurable statuses/boards are deferred; additional task features remain to be discussed. | Tasks owns admission, lifecycle and board behavior. Map imported open tasks to Backlog as a current workflow default, retaining the original open status in source provenance without claiming recorded readiness or activity. Completed tasks map to Done; abandoned tasks remain separately retained and accessible, never mapped to Done. Do not derive completion time. Application composes links to Wiki, Conversation and Calendar. Task historical states are valid relationship/source endpoints. |
| V02 Decisions | Agreed basis: dedicated Decisions domain with a routable global decision log and embedded presentation for other modules. Retain exact text, recorded civil decision date, optional rationale, availability and provenance. | Global and embedded views read the same records. Preserve revisions and final fields after removal without implying the decision is still in force. Optional attribution is retained only when supplied; admission author does not become original author. Application composes connections to relevant subjects, discussions and tasks; Wiki owns Page placement. |
| V02 Observations | Agreed basis: Observations owns structured retained records and embeddable presentation; no standalone measurements page initially. Retain subject, structured source, requested/observed/received timing, optional elapsed milliseconds, structured outcome, availability and provenance. Host/session/weather projections expose recorded measurements and quality metadata, retaining raw external values. | Original Exchange context selects preserved external source material under V01; a current native Exchange link requires verified conversion correspondence. Preserve explicit nulls and collected/failed/unknown outcomes when supplied. Weather coordinates describe measurement context and do not assert anyone's presence. Reopen typed readings without reparsing a SourceDocument. |
| V03 | Graph: extend the same Relationship identity with explicit endpoint/direction knowledge and readable reasons for missing endpoints. Add a distinct source-association shape for topic/place role, optional label, availability and historical endpoints. | Allow unresolved → resolved → revised → unavailable history without creating a replacement identity. Placement does not infer direction. Source associations remain distinct from editorial Topic membership and Wiki Review. |
| V04 | Wiki: separate foreign Appearance records with ordered Page/parent placement and historical owner reference; existing prose Content remains unchanged. Graph owns Query definition and recorded historical result membership/order. Calendar owns a chronology shape with ordered buckets/items, optional labels, original time expressions and recurrence. | Application supplies owner renderers. Reading renders the selected historical Query/chronology state rather than running a current query. Unlabelled buckets need no fabricated Event. Query and chronology contracts require the two original blocked fixtures before their fields are finalised. |
| V05 | Private vault tooling: immutable evidence export and explicit address-translation manifest targeting the composed native schema. | Map each accepted old address to its exact derivative address or an explicit unresolved gate. Preserve source bytes, reconcile prepared/published contribution identities, deduplicate only by verified correspondence and reopen one Conversation through the current GitHub adapter. No startup conversion or published cutover is included in these application changes. |
| V06 | Map: optional typed spatial qualification on CoordinateValue, separate from expression, CRS and any measured accuracy. Initially support the evidenced `street` value; unsupported qualifications fail validation. | Preserve the source qualification through current reading, correction and reopen. Map presentation exposes street qualification alongside coordinates and does not imply building precision. The existing coordinate feature has not implemented this field. |
| V07 | Core Persistence: staged batch synchronization with one complete native parse before acceptance. Core Store: indexed historical validation and bounded snapshot reuse. | Validate every envelope's path/identity/base/sequence/schema prefix before batch publication. Preserve fork/rewrite/foreign-address/invalid-target rejection and exact retry. Failed validation changes no accepted journal/cache. Benchmark cold adapter opening and repeated history reads at increasing sizes, including peak memory. |
| V08 | Sources: a separate Source lead with exact URL, optional title, availability and provenance. | A lead has no required captured text/time/author. References select its exact historical state without declaring captured or supporting evidence. Later capture produces a SourceDocument with an explicit connection to the lead; it does not rewrite the original lead as a capture. |
| V09 | Agent: accepted RunTool version knowledge is explicitly `recorded` with a nonempty version or `unrecorded` with no version. ToolExecution refers to that accepted RunTool. | Live configured ToolDefinition still requires a real version. Import preserves known run configuration, ContextInput content/transformations and attribution. Historical import never executes tools/providers or fabricates ModelSteps. |
| V10 | Proposed core Identity module: retained redirect records with exact historical source/target, availability and provenance; a current canonical-resolution interface. | Follow current redirects with cycle/ambiguity rejection. Historical-reference reading always resolves the originally selected identity/state and never follows current redirects. Alias text and factual Graph predicates do not establish a redirect. |

Observation `place` and ContextInput `suppliedContext` links need a separate typed
structural relation with role, exact historical source/target and availability.
Propose Sources as the owner of this provenance relation, with Application supplying
foreign descriptions. It must remain distinct from live Conversation InputSource,
Graph editorial membership and Wiki supporting/challenging Review.

## Historical deletion needs an explicit decision

The feedback requires selecting a record that was already deleted at the chosen
snapshot. Current Store historical-reference validation requires a live target at
that snapshot. A reference selected while live survives a later deletion, but that
does not satisfy selecting the deletion state itself.

This conflicts with the current historical-reference contract in ADR 0014 and the
data-model documentation. Do not weaken existing evidence validation globally.
Propose a separate schema-defined retained-state reference: it validates accepted
journal/transaction identity, immutable entity type and presence of the retained
record, and exposes its availability. Existing historical evidence references
continue to require a live selected target. Never substitute an earlier live state.

Before implementation, inspect the Store history interface and decide whether this
can extend its reference value format or needs a separate field/value format.
Relationship/source/redirect fields may use retained-state references; supporting
evidence must preserve its existing admission requirements. Record this decision
in an ADR and verify both independent replay and old evidence behavior.

## Implementation order

| Stage | Work | Why / completion gate |
| --- | --- | --- |
| 0 | Incorporate current main; agree retained-state reference, recorded-time and ordered-placement contracts. | These affect several owners. Decide supported semantics before fixing field names. No legacy compatibility types or broad module refactor. |
| 1 | V07 batch validation, historical validation reuse and bounded read caching. | Removes a measured readback bottleneck for every later owner. Preserve rejection behavior; compare performance against the unchanged implementation. Coordinate with `feat/eav-query-limits`, whose query bounds and history work are related but do not implement this request. |
| 2 | Core retained-state references and Calendar recorded-time values; V08 leads, V09 unknown versions, V06 qualification. | Establish shared prerequisites and independently verifiable additions. Deliver each owner with reopened current/historical examples. |
| 3 | V01 external source preservation and conversion correspondence using current Conversation records. | Original container endpoints remain addressable as source evidence. Verify contributions converted into the ongoing dialogue without legacy grouping types; references to source containers do not silently resolve to one or all converted contributions. |
| 4 | V02 Tasks, Decisions and Observations; structural provenance links; V03 unresolved Relationships/source associations. | Complete missing native meanings using stage 2/3 references. Verify revisions, resolution, unavailability and original metadata independently. |
| 5 | V04 foreign Wiki appearances, Query result history and chronology; V10 redirects. | Use the exact blocked fixtures to settle rendering semantics; validate current canonical resolution separately from historical identity. Redirects can proceed earlier if their source/target owners are available. |
| 6 | Return exact implementation commits and evidence; private V05 reconciliation and exhaustive source-backed verification. | Run each owner's checks during its stage. Final migration gate requires all original versions and newer published work in one verified derivative journal. Publishing a cutover is a separate action. |

Each implementation change runs focused owner checks locally and routine verification
in its exact pushed commit's CI. Browser checks are needed where owner reading is
newly wired to presentation. The response table must distinguish implemented owner
capability from verified conversion of the private source inventory.

## Decisions for discussion

1. Tasks is agreed as a dedicated domain module with a Kanban board, comparable
   to Calendar, initially using fixed Backlog, Ready, In progress and Done columns.
   Configurable statuses/boards are deferred. Ordering, additional fields/views and
   cancellation interaction remain implementation/design details to settle.
   Decisions is agreed as a dedicated module with a global list and embedded
   views. Observations is agreed as structured records with embedded presentation;
   a standalone page is deferred.
2. Accept a separate retained-state reference rather than changing what an accepted
   evidence reference means?
3. V01 direction agreed: old notes are external source material and their dialogue
   is processed into the ongoing Conversation. Sources owns preserved originals;
   Conversation does not model legacy containers. Remaining discussion concerns
   source selection/correspondence fields and Wiki ownership of foreign placement.
4. Confirm the original Query/chronology fixture shapes before agreeing V04's
   complete field contract. The feedback alone does not specify enough to do so.

Other decisions remain pending. This document does not mark any request implemented,
agree a schema migration, or claim source conversion completion.
