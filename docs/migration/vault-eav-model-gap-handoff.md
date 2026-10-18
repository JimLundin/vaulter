# Model-contract follow-up after PR #81

Base: `440ebe7` (PR #81). Follow-up branch: `feat/migration-model-gaps`.
The initial owners are merged; this follow-up closes application contracts
identified by a private source audit. Its CI is pending. The audit's original
payloads, names and source text remain in the private Vault checkout.

## Closed application contracts

| Owner | Public admission / reading | Retained meaning and evidence |
| --- | --- | --- |
| [Sources](../../app/modules/sources/index.ts) | insertSourceAssociation / updateSourceAssociation in a caller transaction; createSourceAssociation / reviseSourceAssociation wrappers; readSourceAssociations / readHistoricalSourceAssociation | `edb7391`: topic/place/suppliedContext roles, optional endpoint states and labels, directed/unrecorded direction, independent placement/order, provenance and availability. [Reopen fixtures](../../app/modules/sources/associations.test.ts) retain missing knowledge, deleted endpoint selections and clarification history. |
| [Graph](../../app/modules/graph/index.ts) | savedQueryAdmission; readQueries / readQueryEmbed; querySelectionAdmission / readQuerySelections | `ab35de3`, `9778045`, `6459421`: omitted sort retained, snapshot evaluation, exact source taxonomy evidence and immutable ordered migration-evaluation selections. [Definition fixtures](../../app/modules/graph/saved-queries.test.ts) and [selection fixtures](../../app/modules/graph/query-selections.test.ts) separate definition, derived results and captured evidence. |
| [Calendar](../../app/modules/calendar/index.ts) | chronologyAdmission; readChronologies / readChronologyClosure / readChronology | `c4f6b6b`: optional labels, civil contexts, separate yearly recurrence, collections and exact ordered cross-owner placements. [Closure fixtures](../../app/modules/calendar/chronology.test.ts) preserve child-only revisions, deleted selections and final fields without fabricating Events or deleting descendants. |
| [Application embed reading](../../app/application/composition/embeds.ts) | Existing owner dispatch for saved Query, QuerySelection and Calendar chronology | `d4238bc`: readers use selected live/pinned/host cutoff through the existing embedding seam. [Dispatch fixture](../../app/application/chronology-embeds.test.ts). No new collection authoring UI or migration source parser is introduced. |

Sources uses `direction: unrecorded` for the audit's unknown-direction cases.
Placement never establishes direction. Original dialogue endpoints select preserved
external Source versions, including their source metadata; Conversation receives
converted contributions in its current ongoing format. There are no legacy
Conversation or Exchange grouping types.

A source-aware Query provider supplies effective kind/tag classification at an
explicit source cutoff, retained evidence references and optional SHA-256 hashes.
Connected type keys and tag-label fallback belong to that provider's source
interpretation, rather than treating unresolved relationships as factual edges.
The default sort is title; an omitted sort remains omitted in the definition,
and equal sort values retain supplied candidate order. Captured selections are
explicitly migration-generated; absent original execution history stays absent.

Chronology closure reads placement membership at the requested cutoff and resolves
its exact parent/child selections. Private tooling must record changed placements
when a child changes independently. An unlabeled date context or Timeline remains
a context/collection. A yearly civil anchor does not assert an observed occurrence.
Current Calendar year/month/day/instant, point/range/unknown and expression support
covers the audited scope, including exact timestamps. Observation timings retain
exact owner timestamp strings and explicit nulls; admission time is not source time.

## Retained contribution metadata

Conversation owner commit `f0be87f` adds `appendRetainedContribution` in a caller
transaction, with current/historical metadata exposed through `projectedExchange`
and Conversation reading. Exact user input JSON, agent model, token counts,
source timing/precision and provenance survive independently of live execution.
Omission and explicit null remain distinct. Supplied model/usage is not evidence
of an observed provider request and creates no Agent run or ModelStep. Structural
`suppliedContext` endpoint references remain typed Sources associations.
[Metadata fixtures](../../app/modules/conversation/retained-contributions.test.ts)
cover revisions, reopen, native input, nulls and invalid usage. Integration of this
owner commit into the follow-up branch is pending.

## Remaining private verification

The private migration must separately verify preserved source revisions, native
correspondence receipts, source classifier semantics, generated Query result
selections, and exhaustive chronology closure after edits/deletions. Unverified
native correspondence retains explicit external source selections. Application
fixtures establish representability and reopened behavior, not conversion credit
for the private source inventory.

Run focused owner checks locally, then inspect the exact follow-up commit's CI.
The initial PR #81 passing workflow does not verify these new commits. Publishing
or replacing a journal remains a separate concrete migration operation.
