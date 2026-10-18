# Exact contracts still needed for native migration

This supplement is based on the retained inventory at source commit
`a52900fb02a94d4fbb19afc895736f7a5b9d5a69` and the typed Vaulter model at
`793a71fe9fcd3eb4ac40603d679737fc8a26312c`. The executable audit
`knowledge-remaining-native-gap-contracts.mjs` verifies each selected original
payload, sequence and SHA-256 against the bound 48,327-version inventory. These
are original-history counts, not final conversion credit.

## Recorded Task and Decision owners

Task requires a stable identity, exact text, recorded status, optional civil due
date, availability, and historical Page placement/order. There are 22 Task states
across 17 identities: 18 open, three completed, one abandoned. Six states record a
due date. Completion status has no recorded completion timestamp and must not be
turned into one.

Decision requires stable identity, exact text, recorded civil date, optional
rationale, availability, and historical Page placement/order. There are 144 states
across 135 identities, including five deletions; 93 states retain a rationale.
Deleted states must remain addressable and retain their final recorded fields.
Original author and transaction provenance must remain separate from migration
admission time. Task and Decision must also work as exact historical endpoints for
relationships and source references.

## Uncaptured URL leads

There are 359 Resource states across 356 identities, including three retirements.
The original data here contains URL only. The required owner contract is stable
identity, exact URL, optional title for the general record shape, and availability.
Do not infer captured text, capture time or capture authorship. Identical URLs do
not justify merging distinct original identities. Lead references must resolve the
exact retained state without becoming evidence-capture or supporting-review claims.
The existing SourceDocument shape requires text and capture metadata and cannot
faithfully represent an uncaptured lead by itself.

## Source topic/place associations and Exchange grouping

There are 592 source-association states: 548 topic and 44 place. 590 record a
directed Exchange→Page connection. Two retain a role/label and placement without
directed endpoints; direction must stay unrecorded.

Exact original Exchange selection changes the migration plan substantially:
334 association states point to Exchange states with no accepted retained
contribution, 238 point to states split across several native contribution
Exchanges, and only 20 point to one contribution Exchange. Even those 20 lack
verified conversion of the complete original Exchange owner history. Selecting
one contribution or copying an association onto every contribution would change
the original meaning.

Provide a complete historical original Exchange grouping endpoint, retaining the
recorded metadata and ordered contributions independently of contribution text.
Once supported, each association must retain exact Exchange and Page endpoints,
recorded topic/place role, label, identity and availability. The grouping work and
association owner work should agree on one endpoint contract. This is source
association semantics, not editorial Topic membership or evidence review.

The migration now has an admission planner that requires exact SHA-bound endpoint
receipts and explicit complete-owner-history verification. It rejects placement as
direction, cross-journal receipts, fabricated hash correspondence and substituting
an earlier available Page state for the selected deleted one.

## Historical execution with unknown tool versions

Execution has 12 states across nine identities: four AgentRun states, six
ContextInput states and two ToolExecution states. Every AgentRun state records
accepted tool names without versions; both ToolExecution states lack the tool
version too. Current ToolDefinition and RunTool require a version string.

Provide a supported explicit unrecorded version state for historical accepted
configuration and tool execution. An invented version, empty version string or
migration sentinel would assert information the original data does not contain.
Run configuration must remain distinct from later editable Agent configuration.
Preserve all exact ContextInput content and transformations, Actor attribution and
original run/Exchange correspondence. No observable provider ModelStep boundary
was recorded, so importing run metadata must not manufacture ModelSteps.

## Retained identity redirects

There are 12 original created `merged-into` records across 12 identities. Provide
retained redirect identity and source/target historical references, with current
canonical resolution separate from accepted historical resolution. Existing
references must continue to resolve the originally accepted source state.
Representing this solely as a factual named Graph relationship does not establish
identity-redirect behavior.

## Review feedback contract

For each requested shape, return the owning type and field contract, public
admission API, historical-reference behavior, current read API, and a focused
example that survives independent reopening. State whether optional metadata is
absent, unknown or unsupported. Migration can then bind exact original versions to
those contracts and verify the resulting journal through current adapters.

The bound audit artifact is
`/tmp/vault-remaining-native-gap-contracts-20261018.json` in the migration workspace.
It includes selected association endpoints and grouping counts, execution gaps,
redirect payloads and all input hashes. This document carries the essential
contracts without requiring access to that private workspace.
