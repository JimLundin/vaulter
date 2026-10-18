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
