# Retain citation selections in historical snapshots

Wiki citations retain exact claim and source addresses plus the snapshot and half-open UTF-16
range used to select each passage. ADR-0002 deliberately keeps child placement independent of a
container's version: recording the snapshot prevents a later child edit from changing a citation,
without rewriting the paragraph or storing a second copy of its quotation.

The text projection concatenates inline fragments, separates blocks with newlines and table cells
with tabs, and excludes structural references. New projection semantics require a new selection
format; existing `unit: 'utf16'` selections retain these semantics. The owning feature validates
both selections against their historical snapshots. Composite foreign keys establish existence,
not support: support requires an explicit evidence review.

Page references use the same `cite` kind with `scope: 'page'`, an exact source address and a source
snapshot, without a claim selection. They describe provenance. A capture link or explicit source
section establishes that association; an arbitrary hyperlink does not support its surrounding
statement. Existing whole-source `{ kind: 'cite' }` records remain readable.

The old vault has already been published as node history. Enrichment appends reference nodes and
preserves that prefix, including all existing identities and lifecycle records. Regeneration and
replacement would invalidate exact addresses; the original importer remains a scratch verification
facility, not the procedure for enriching a published vault.

Wiki is the collection of distilled sources. Citation targets and page provenance point to retained
conversations, reports or independently captured material; Wiki pages and every block within them
remain navigation targets. Source eligibility is checked in the passage's historical snapshot,
so an inline or section address cannot bypass the boundary. Linked Wiki pages may help retrieve
their underlying sources, but their prose cannot serve as evidence. This supersedes the early
scratch review's acceptance of secondary Wiki passages; none of that output was published.
