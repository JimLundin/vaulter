# Agreed contracts and implementation order

Status: product directions agreed on 2026-10-18; initial owners merged in PR #81.
Follow-up model contracts are implemented on `feat/migration-model-gaps`; its CI
and private source conversion verification remain pending.
The [response handoff](vault-eav-response.md) records exact integrated commits,
public owner entries and remaining verification. Implemented application capability
is separate from verified conversion of the private source inventory; the new
migration has not been verified by this document.

This plan responds to [the feedback](vault-eav-feedback.md), its
[exact gap contracts](vault-eav-gap-contracts.md), and the
[Observation supplement](vault-eav-observations.md).

The initial feedback branch was `feedback/vault-eav-migration-20261018`, merged
at `440ebe7` in PR #81. Follow-up work uses `feat/migration-model-gaps` from that
main commit. Paths below use the current ownership layout. These documents and
the sanitized [model-gap handoff](vault-eav-model-gap-handoff.md) remain the
public request/implementation record.

The agreed directions are: convert old dialogue into the ongoing Conversation and
preserve originals as external Sources; dedicated Tasks and Decisions modules;
embedded structured Observations; native incomplete relationship candidates;
general live/pinned embeds; only the new migration; street qualification;
URL-only source leads; explicitly unknown historical tool versions; general
identity redirects; and separate references that can select exact deleted states.
Storage performance work is deferred separately from model and migration
acceptance criteria. Typed structural provenance, saved Query selections and
chronology closure now have application contracts; private tooling must still
verify source correspondence and actual conversion.

## Common contract

Each owner exposes retained definitions, validated transactional admission, and
current/historical reading through its public entry. Admission accepts an existing
Transaction so related owner changes can publish atomically. Application composes
definitions and cross-owner presentation; the private translator supplies source
correspondence. Owners do not parse old vault formats or assign conversion credit.

Where a source record maps to a native owner record, retain its verified identity
correspondence and revisions at selected native snapshots. Original dialogue
containers remain external Sources under V01; they do not require native groupings. Keep exact source identity/version/provenance separately from
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
owns civil-date and time interpretation. Its current year/month/day/instant and
point/range/unknown values cover the audited chronology scope; exact timestamps
are supported. No Calendar precision extension is a blocker for that scope.
Observations preserves its own exact timestamp strings and explicit timing nulls.
Import/conversion time is never occurrence, completion or capture time.

## Contracts by request

| Request | Agreed direction and retained shape | Required behavior |
| --- | --- | --- |
| V01 | Agreed product direction: private tooling processes old conversations into the current ongoing dialogue. Sources retains old notes as external source material, including original versions and structure needed for provenance. Conversation gains no legacy conversation/exchange grouping types. | Converted contributions use current Conversation semantics. References to an original container select its preserved external source state rather than an arbitrary converted contribution. Source-to-native correspondence remains explicit. Source capture/admission time is distinct from original dialogue time. Sources associations now preserve typed roles, retained endpoint selections and independent placement; private source-to-native receipts still need verification. |
| V02 Tasks | Agreed basis: dedicated Tasks domain and routable presentation, comparable to Calendar, with fixed Backlog, Ready, In progress and Done columns. Retain task text, optional civil due date, availability and provenance. Configurable statuses/boards are deferred; additional task features remain to be discussed. | Tasks owns admission, lifecycle and board behavior. Map imported open tasks to Backlog as a current workflow default, retaining the original open status in source provenance without claiming recorded readiness or activity. Completed tasks map to Done; cancelled and abandoned tasks remain separately retained and accessible, never mapped to Done. Do not derive completion time. Application composes links to Wiki, Conversation and Calendar. Task historical states are valid relationship/source endpoints. |
| V02 Decisions | Agreed basis: dedicated Decisions domain with a routable global decision log and embedded presentation for other modules. Retain exact text, recorded civil decision date, optional rationale, availability and provenance. | Global and embedded views read the same records. Preserve revisions and final fields after removal without implying the decision is still in force. Optional attribution is retained only when supplied; admission author does not become original author. Application composes connections to relevant subjects, discussions and tasks; Wiki owns Page placement. |
| V02 Observations | Agreed basis: Observations owns structured retained records and embeddable presentation; no standalone measurements page initially. Retain subject, structured source, requested/observed/received timing, optional elapsed milliseconds, structured outcome, availability and provenance. Host/session/weather projections expose recorded measurements and quality metadata, retaining raw external values. | Original Exchange context selects preserved external source material under V01; a current native Exchange link requires verified conversion correspondence. Preserve explicit nulls and collected/failed/unknown outcomes when supplied. Weather coordinates describe measurement context and do not assert anyone's presence. Reopen typed readings without reparsing a SourceDocument. |
| V03 | Agreed basis: Graph retains native relationship candidates with known predicate/label/endpoints, explicit missing direction/endpoint knowledge and readable clarification reasons. Imported incomplete relationships use the same contract as newly recorded candidates; preserve external source provenance. Sources owns typed source associations separately from factual Graph relationships. | Allow candidate → resolved → revised → unavailable history without replacing identity. Do not infer direction or endpoints from placement. Expose candidates for clarification rather than omitting them from native conversion due to legacy origin. Source associations remain distinct from editorial Topic membership and Wiki Review. |
| V04 | Agreed basis: cross-module embedding, including Wiki and Chat hosts, defaults to live owner data and supports an explicit pinned recorded state. Hosts own placement/order; target owners supply embedded reading/presentation; Application composes foreign renderers. Initial examples include Tasks, Map locations and Questions. Graph now owns saved Query definitions and captured ordered selections; Calendar owns date contexts, collections and exact cross-owner chronology placement. | A live embed follows current owner data; a pinned embed resolves its exact accepted state despite later changes. Historical host reading must not silently display today's data as the old result; distinguish host configuration history from retained result evidence. Do not duplicate target records or couple host modules directly to all target owners. Unlabelled chronology acquires no fabricated Event. |
| V05 | Agreed scope: private tooling performs only the new migration into the current composed native schema. The previous one-time test migration is excluded from reconciliation and compatibility requirements. | Verify the new migration's source correspondence, identity, provenance and historical readback independently. Vaulter gains no startup conversion or retired-schema compatibility. The old test journal need not be merged into the result. Actual publication/replacement of a configured journal remains a separate concrete operation. |
| V06 | Agreed basis: Map adds optional typed spatial qualification on CoordinateValue, separate from expression, CRS and measured accuracy. Initially support evidenced `street`; future values extend the vocabulary. | Preserve qualification through current reading, correction and reopen. Display meaningful street qualification alongside coordinates, including embedded views, without implying building precision. Unsupported values fail validation until explicitly supported. |
| V07 | Separate storage-implementation improvement: indexes, bounded snapshot reuse and avoiding repeated validation; no domain model change. | It can improve exhaustive migration readback and ordinary history browsing, but is outside the current model work and migration acceptance criteria. Any future optimization must preserve validation and be measured independently. |
| V08 | Agreed basis: Sources owns a separate Source lead with exact URL, optional title, availability and provenance. | A lead has no required captured text/time/author. References select its exact historical state without declaring captured or supporting evidence. Later capture produces a SourceDocument with an explicit connection to the lead; it does not rewrite the original lead as a capture. |
| V09 | Agreed basis: Agent retains an explicit unknown-version marker in historical tool execution records when no version was recorded. Agent uses `versionStatus: unknown` without a version; known history retains its nonempty version. | Live configured ToolDefinition still requires a real version. Import preserves known run configuration, ContextInput content/transformations and attribution. Historical import never executes tools/providers or fabricates ModelSteps. |
| V10 | Agreed general capability across record types: retained identity redirects with source/target, availability and provenance, plus current canonical resolution. Core Identity owns same-type redirects and current/exact historical resolvers; merge UI and direct navigation adapters remain separate work. | Follow current redirects with cycle/ambiguity rejection. Historical-reference reading always resolves the originally selected identity/state and never follows current redirects. Alias text and factual Graph predicates do not establish a redirect. |

Sources now owns typed `topic`, `place` and `suppliedContext` associations with
retained source/target states, optional label, independent placement/order,
provenance and availability. An incomplete association remains a candidate;
placement does not supply direction. The API uses `unrecorded` for absent direction
knowledge. These associations remain distinct from Conversation InputSource,
Graph editorial membership and Wiki supporting/challenging Review.

Graph Query classification may be supplied by a source-aware provider with exact
source cutoff, retained evidence and optional SHA-256 hashes. It does not turn
unknown-direction candidates into factual edges. Definition revisions, derived
results and captured `migration-evaluation` selections remain distinct; tied
results retain supplied candidate order.

Calendar chronology contexts retain optional labels, civil anchors and yearly
recurrence without asserting an Event occurrence. Collection identities and exact
parent/child placements retain ordering and selected deleted states. Closure reads
membership at the requested cutoff, including independently changed children.

## Agreed historical deletion contract

The user approved a separate retained-state reference on 2026-10-18. It may select
a record already deleted at the chosen snapshot and must expose that exact state
and its availability. Selecting an earlier live state is not an alternative.

Store's existing historical-reference validation requires a live target at the
selected snapshot. Retain that requirement for existing evidence references under
[ADR 0014](../adr/0014-eav-only-vault.md) and the supporting-evidence boundary in
[ADR 0005](../adr/0005-wiki-citation-selections.md). The agreed addition extends
available reference kinds without weakening those admission rules globally.

A schema-defined retained-state reference validates accepted journal/transaction
identity, immutable entity type and presence of the retained record. Relationship,
provenance and redirect fields may use this separate reference kind. Supporting
evidence continues to require availability at the selected state. The Store owner
recorded the addition in ADR 0015 with replay, exact deletion-selection and
unchanged evidence-reference rejection fixtures.

## Implementation order and current progress

Several independent owner additions were implemented in parallel after agreement.
This order describes remaining dependencies rather than requiring those completed
changes to be rebuilt in sequence.

| Stage | Work | Completion gate / current progress |
| --- | --- | --- |
| Foundation | Incorporate current main and agree shared reference behavior. | Initial owners and separate retained-state references merged at `440ebe7`; current Calendar values cover the audited civil/timestamp precision. Follow-up placement contracts are implemented. No legacy compatibility types or broad module refactor. |
| Owner bases | V02 Tasks, Decisions and Observations; V03 candidates; V06 qualification; V08 leads. | Initial capabilities integrated; exact commits and focused-check evidence are in the response handoff. Typed Sources associations are implemented in `edb7391`; actual source-backed mapping remains separate private verification. |
| Shared history and identities | Retained-state references, V09 unknown versions and V10 general redirects. | Product contracts agreed; all three owner implementations are integrated. Exact owner commits are in the response handoff. Redirects must distinguish current canonical resolution from exact historical identity. |
| Embedding | V04 general live/pinned embeds in Wiki and Chat. | Single-record views and Wiki/Chat insertion controls are merged. Follow-up saved Query selections and chronology closure use existing embed dispatch in `d4238bc`; no new UI authoring workflow is introduced. |
| Source conversion | V01 external originals and verified correspondence to current Conversation records; typed structural provenance links. | Application source-association, saved-query and chronology APIs are available. Private tooling verifies conversion without legacy grouping types; original endpoints retain external source selections, and native correspondences require receipts. |
| Migration verification | Exhaustive source-backed verification of only the new migration. | Inspect actual source inventory and independently reopened native records/history. No reconciliation with the old test migration. Journal publication/replacement is a separate concrete operation. |
| Deferred separately | V07 storage indexing/caching/reduced repeated validation. | No model change and no migration acceptance prerequisite. Preserve rejection behavior and measure any optimization independently. |

Each implementation change runs focused owner checks locally and routine verification
in its exact pushed commit's CI. Browser checks are needed where owner reading is
newly wired to presentation. The response table distinguishes implemented owner
capability from verified conversion of the private source inventory.

## Remaining verification and separate product work

- Private source selection, preserved revisions and source-to-native correspondence
  receipts. Do not infer correspondence from equal text, URLs or placement.
- Exhaustive private conversion checks for associations, saved Query evaluation
  evidence and ordered chronology closure. Application fixtures close model
  contracts; they do not certify the source inventory's converted output.
- Retained contribution metadata is implemented by the Conversation owner in
  `f0be87f`, pending follow-up integration: exact input JSON, recorded model choice,
  token counts and supplied timing/precision survive without invented Agent runs
  or ModelSteps. Verified structural input references remain Sources associations.
- Focused checks and exact pushed-commit CI for `feat/migration-model-gaps`.
  The earlier passing PR #81 workflow does not verify this follow-up.
- Direct navigation adapters, merge UI and collection authoring controls remain
  separate product work. Existing readers dispatch the new collection records.

The product directions remain agreed. No Calendar minute/second/null extension is
required by the audited chronology source scope. Exact observation timing belongs
to Observations, and original dialogue metadata remains preserved Sources unless
converted through a verified native correspondence.
