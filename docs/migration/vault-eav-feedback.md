# Vault migration: current-model feedback and response contract

The vault migration targets Vaulter's current typed EAV owners and one journal.
Several original meanings cannot yet be read through those owners. This handoff
asks Vaulter to agree on the missing contracts, implement the accepted changes,
and record the response here so the migration can consume a specific app commit.
Preserving original JSON in a Source document is evidence preservation; it does
not establish native conversion of its meaning.

Reviewed on 2026-10-18 against application commit
`793a71fe9fcd3eb4ac40603d679737fc8a26312c` and live commit
`5339731c3321ed649900f123c48ea84e2c2ae894`. The live change only updates
`app/README.md`; the proposed module moves have not supplied new record shapes.
The bound original inventory contains 48,327 versions, 37,518 identities and
411 transactions. Queued native receipts are not completed migration evidence.

## Decisions that remain binding

- [ADR 0014](../adr/0014-eav-only-vault.md): one typed EAV journal; published
  history is immutable; private conversion happens before application opening.
- [ADR 0011](../adr/0011-chat-agent-eav-adoption.md): one ongoing native
  Conversation; Agent owns execution; unavailable model requests are not invented.
- The glossary distinguishes source material, Wiki knowledge, directed
  Relationships, Containment, and source association from reviewed Citation.
- Future Chat contributions are their own sources. They do not require duplicate
  Source documents. Imported documents remain useful evidence.

The requests below preserve these decisions. They are proposed capabilities,
not decisions to recreate the old node format or to retain retired owners.

## Requests

| ID | Request | Source evidence | Current limitation |
| --- | --- | --- | --- |
| V01 | Addressable imported dialogue grouping and metadata | 349 original states: 157 Conversation, 147 Exchange, 45 earlier Page states | Native Conversation has only `createdAt`; Exchange does not represent imported multi-contribution grouping |
| V02 | Typed recorded intentions and lifecycle | 166 states across 152 identities: 22 Task, 144 Decision | No Task/Decision owners in the composed application registry |
| V03 | Explicit unresolved relationship meaning | 546 named-relationship states; 344 currently eligible, 202 pending | Graph requires a directed source; placement alone does not establish direction |
| V04 | Ordered cross-owner content and chronological context | Two blocked original Wiki projections involving Query/Timeline content | Wiki cannot express/read those foreign owners in original placement |
| V05 | Explicit published-journal conversion and reference reconciliation | Published request contains 585 source/Exchange pairs and retired `chat.migration` | Current registry rejects removed type; prepared and published identities differ |
| V06 | Typed spatial qualification | One original location records `geo.precision: street` | Map coordinates preserve it in expression text but lack typed qualification |
| V07 | Efficient validation and historical reading at migration scale | Live imports/readback take hours with the bound historical inventory | Adapter reparses the accumulated journal for every incoming transaction; historical lookups replay prefixes repeatedly |

### V01 — Imported dialogue grouping

Preserve source conversation and source exchange identities as historical,
addressable groupings within the single ongoing Conversation. Preserve exact
title, summary, preamble, supplied creation/start/end values, timezone/precision,
availability and ordered member references. Choose the owning module and public
admission/reading interface; these groupings must not create extra native
Conversations.

The accepted-prefix correspondence audit maps 60 original Exchange states to
one retained contribution Exchange, 56 to several, and 31 to none. An original
Exchange with several contributions cannot resolve to one arbitrarily selected
member. Relationships must address the grouping's exact historical state.

The exact snapshot plan retains 157 conversation titles and creation values,
48 creation precisions; 147 exchange starts, 145 start precisions/timezones,
69 summaries, 26 preambles and 20 end values. Ordered immediate children also
include source associations, Relationships, Observations, Agent runs and earlier
Page content; grouping only Messages would lose meaning. Four earlier Message
versions have accepted later revisions but lack exact earlier-state correspondence:
two user text revisions and two running Agent activity states. Reopen both states
without adding duplicate contributions.

Acceptance: introduce, revise and delete an imported grouping; reopen and read
each recorded state and member order; preserve explicitly missing fields. An
original summary remains imported source material. Do not create a Context
checkpoint by inventing its required generating Agent run or source coverage.

### V02 — Recorded intentions, decisions and observations

Agree on typed ownership and lifecycle against actual retained fields before
adding records. A concrete original Task records `what: Renew the gym membership`,
`due: 2026-10-04`, `status: open`, and a placement parent/order. Its due date must
remain a civil date; admission time does not prove completion or occurrence.
Tasks and Decisions participate in Containment and directed Relationships.
Wiki prose alone cannot retain those native meanings.

Acceptance: preserve original identity, supplied text/status/due/actor/outcome
fields and absence, exact historical endpoints, placement, revisions and
deletion. Separate supplied state from later interpretation. Observation is
already a glossary term; audit its actual retained fields before deciding whether
existing execution observations cover them or another typed contract is needed.

### V03 — Relationships with unrecorded endpoints

Keep resolved directed Relationships separate from their unresolved source
evidence. Provide a typed, addressable representation for a recorded predicate or
label whose direction/endpoints were not recorded. The exact missing-endpoint
reason must be readable without inventing a source from placement or a title.

The pending audit has 56 unrecorded-direction endpoints, 36 endpoints awaiting
exact native receipts, and 138 endpoints awaiting native owners. These are
endpoint counts, not disjoint version counts. Some pending states will become
convertible as V01/V02 and other owner work lands.

Acceptance: unresolved → resolved → revised/deleted transitions preserve one
identity and recorded history. A deleted endpoint resolves its exact deleted
state rather than falling back to an earlier live state. Effective time,
modality and review remain absent when unrecorded. Distinguish source
associations and placement from editorial Topic membership and reviewed Citation.

### V04 — Cross-owner Containment and chronology

Provide explicit ordered presentation/reading of Query and Timeline owners
inside imported content. Agree how historical query results, original ordering,
unlabelled date buckets, recurrence and unavailable chronological content should
be retained. A directory move or an arbitrary Event is insufficient.

Acceptance: both blocked historical Wiki projections reopen with their original
text and owner placement; later current corrections preserve historical reading.
Civil-date precision, reporting time and occurrence remain distinguishable;
unlabelled chronology does not acquire invented Event titles/status/times.

### V05 — Published history and current schema

Published transaction `5dd4fc78-7955-47cf-b144-c2c1edb1eb87` has 8,497 facts,
585 RetainedSource/Exchange pairs, one Conversation and a retired
`chat.migration` marker. Current opening fails with
`SchemaMismatchError: Schema requires an explicit migration: removed type chat.migration`.
All 585 original source addresses/occurrence payloads match the 610-contribution
prepared prefix, but no matched native source/Exchange identity pair is identical.

Agree on a private conversion contract and historical-reference reconciliation
that can combine original published history and newer prepared work into one
current-model journal. This is not a request for startup compatibility or for
restoring `chat.migration` in the application registry.

Acceptance: retain exact published bytes as evidence, preserve or explicitly
translate every accepted historical address with a verifiable manifest, deduplicate
matched contributions, retain one Conversation, and read converted records through
the current application and GitHub journal adapter. Do not overwrite the published
root with the prepared root or silently redirect identities. Private derivative
experiments must not be confused with a published cutover.

### V06 — Spatial qualification

Support typed interpretation and reading of a supplied qualification such as
`street`. The private coordinate probe has verified 21 durable native states
across 15 locations, preserving the exact qualification in `expression`; original
historical Page mapping is a separate admission gate.

Acceptance: preserve latitude/longitude and supplied qualification after reopen,
historical correction and current reading. Decimal places, source accuracy and
coordinate reference system are separate meanings. Consumers must not treat a
street-level location as a building location. Coordinate states supplement Page
history and do not receive duplicate original-version coverage credit.

### V07 — Journal validation and historical read performance

Inspect `app/application/persistence/journal/github.ts`: `synchronize()` invokes
`parseJournal` on the entire accumulated journal after each added transaction.
The store parser also resolves historical-reference facts through prefix replay;
historical resolving/inspection can replay the same prefixes repeatedly. This
multiplies the cost of cold opening and exhaustive migration readback. Adding
workers alone does not remove that algorithmic cost.

Provide incremental validated journal extension and/or reuse validated snapshots
for historical reading, with invalidation tied to accepted immutable history.
Keep complete schema-history, contiguous sequence/base, historical-reference,
fork and rewrite validation. The migration must continue checking every original
state; a reduced sample is insufficient. The private verifier can separately
deduplicate identical checks without changing the application's semantics.

Acceptance: benchmark current and changed code on representative journals with
increasing transaction/fact/reference counts, include independent cold opening
through the GitHub adapter, and show complete equivalent rejection of invalid
history. Report wall time and peak memory. Retain exact persistence retry and
historical correctness; do not replace validation with trust in a migration report.

A focused synthetic benchmark on the pinned native runtime measured cumulative
parsing at 40/80/160 transactions as 257/1,954/13,300 ms; one final complete native
parse took 42/61/338 ms. These are controlled measurements, not a full-vault ETA.
They support optimizing repeated validation while retaining equivalent checks.

## How Vaulter can respond

Update [vault-eav-response.md](vault-eav-response.md) on this branch for each
request: accepted contract or reason for an alternative, owning module/public
interface, implemented commit, focused verification evidence and remaining gaps.
If a change lands elsewhere, put its branch and exact commit in the response.
The migration will inspect that commit, pin it, rerun source-backed admission and
historical readback, then report the results. A schema change alone does not
establish full migration completion.

## Evidence provenance

The source reports live in the vault repository under
`.vaulter/knowledge/conversation-audit/`. The handoff uses aggregate counts and
one bounded Task example rather than copying the private vault contents.

- `current-native-dialogue-correspondence-v2-793a71f-report.json`
- `current-lifecycle-history-plan-report.json` (earlier app inspection; current
  owner absence rechecked against the commits above)
- `current-native-named-relationship-queued-793a71f-report.json` (planned gates,
  not completed shared-journal admission)
- `current-original-wiki-projection-boundaries-report.json`
- `current-published-eav-registry-reconciliation-report.json`
- `current-published-chat-correspondence-20261018-report.json`
- `current-native-coordinate-durable-preflight-793a71f-report.json` (synthetic
  subjects; actual historical-subject admission remains separate)

Full completion requires all original versions, current reviewed knowledge,
newer remote content and published history in one journal, with native semantics,
exact evidence, identity/chronology and current application readback verified.
