# Sources

Sources owns captured Source documents and uncaptured Source leads. Neither retention nor availability
certifies assertions. `documentSources` accepts only documents with recorded captured text; leads
cannot supply citation passages or imply supporting evidence.

`createSourceLead`, `reviseSourceLead` and `removeSourceLead` publish transactions. Leads retain the
exact absolute HTTP/HTTPS URL, optional title, availability and optional JSON provenance. URL equality
never identifies or deduplicates records. Optional `source` selects the exact historical source state
from which the lead was obtained, independently of entity identity and publication authorship.

`readSourceLeads`, `readSourceLead` and `readHistoricalSourceLead` expose structured current or
historical readings. Removal changes availability and retains values. Explicit historical reading can
show the original lead and its current unavailable state after removal. `SourceLeadView` is reusable
read-only presentation for caller-selected live or pinned states; there is no standalone Sources page.

`captureSourceDocument` creates a separate document with actual supplied text, attribution and capture
time. Its optional `lead` reference records the exact preceding lead state; it does not rewrite the lead.
Existing documents may omit this connection. Source-specific translation stays in private Vault tooling.

`SourceAssociation` retains recorded source context with stable identity and `key`, a role
(`topic`, `place` or `suppliedContext`), optional label, availability and explicit direction
(`directed` or `unrecorded`). Its optional `source` and `target` are Retained state references.
`sourceAssociationStatus` reports a candidate until both endpoints and direction are recorded.
Placement alone never establishes an endpoint or direction. Clarification revises the same identity.
These associations assert recorded context, not editorial Topic membership or supporting Review evidence.

Optional `placement` separately selects an exact external source state; `placementOrder` preserves
an actually recorded string order token. Absent order remains absent. `provenance` selects retained
source states using typed references, not identifiers hidden in JSON. References validate journal,
scope, type and selected Snapshot at acceptance and replay, including engine-deleted records.
Domain removal uses `available: false` and retains final fields; engine deletion is reported separately
by retained-state resolution. Historical association reading exposes recorded and current values.

`insertSourceAssociation` and `updateSourceAssociation` accept a caller-owned Transaction for atomic
admission with other owner writes. `createSourceAssociation` and `reviseSourceAssociation` publish
standalone Transactions. `readSourceAssociations` and `readSourceAssociation` select current or exact
historical Snapshots; `readHistoricalSourceAssociation` accepts a Retained state reference.

An external discussion endpoint selects its preserved SourceDocument state. Private migration tooling
must verify correspondence before selecting a converted native Exchange instead. Associating a source
container does not associate each contribution independently and adds no legacy grouping to Conversation.
The synthetic `associations.test.ts` fixture exercises durable reopening, exact source/subject snapshots,
candidate clarification, source placement, withdrawal and invalid-reference rollback without private data.
