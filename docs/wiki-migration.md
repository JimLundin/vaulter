# Wiki migration and evidence enrichment

The published Markdown import holds page content as ordered, independently versioned nodes.
Enrichment appends to that baseline, preserving its identities, history, prose and lifecycle records.

Wiki is the collection of distilled sources. Statements and page provenance cite underlying retained
conversations, reports or independently captured material. Wiki pages, sections, paragraphs and
inline nodes are navigation targets and retrieval aids. Their prose is never a citation source,
including when it repeats the same fact or has no reciprocal link. Source eligibility follows the
passage's containment in its historical snapshot.

| Existing content | Enrichment and projection |
| --- | --- |
| Title, summary, aliases, created, geo/address | Page header and details |
| Formatted prose, lists, tables, code | Original block and inline identities retained |
| Type/tag relationships | Separate classifications resolved from terms |
| Named relations and locations | Named connections with unresolved labels retained |
| Dates, questions, tasks, decisions | Owning-module records with their existing lifecycle/history |
| Capture links, explicit source sections and source relationships | Page references to retained sources; Wiki targets remain navigation |
| Reviewed statement support | Exact claim-to-source citation with two historical selections |

## Historical selections

[ADR-0005](adr/0005-wiki-citation-selections.md) defines the source boundary and selection semantics.
A citation connects exact claim and passage versions. Its `unit: 'utf16'` data holds two nonempty,
half-open ranges, each with the snapshot sequence in which its text was reviewed. A container's
exact version does not freeze its children; the snapshot retains those descendants. Quotations are
derived from history and never copied into citation data.

Inline fragments concatenate verbatim across formatting, blocks use newlines and table cells use
tabs. Structural references contribute no text. Assistant text parts concatenate, and exchange
preambles precede the turns; tool output is not source prose. Ranges cannot split surrogate pairs.

Source context survives later edits/deletion and reports `newer` or `deleted`. An edited claim
withholds old support if its current text differs, retaining the citation in history. Placement
cannot retarget support to another claim. Transaction author describes who recorded the source;
message `speaker` separately identifies the user/agent role. Import attribution is not a speaker.

`WikiPage` exposes `metadata`, `sources` and `blocks`. `WikiReference` retains exact source,
snapshot, context, selection, title and attribution. Historical reads paginate all transactions.

## Review and enrichment

```sh
npm run migrate:review -- --vault /home/jim/vault --vault-ref HEAD --out /tmp/wiki-review
# Agents read the per-page packets and write decisions/<page>.json.
npm run migrate:review -- --vault /home/jim/vault --compile /tmp/wiki-review
npm run migrate:enrich -- --vault /home/jim/vault --review /tmp/wiki-review/evidence-review.json --out /tmp/wiki-enrichment
```

Retrieval follows linked Wiki pages to their source references and ranks only underlying passages.
Lexical overlap finds candidates; it never establishes support. Every page with candidates needs a
decision, including rejections. Review must establish the entire selected fragment: narrow or reject
unsupported qualifiers and plans represented as completed events. Agent reports retain their
attribution and report status; they do not independently verify an external fact. Uncaptured web
resources have a URL but no passage text to select.

[The fictional input example](wiki-evidence-review.example.json) shows exact addresses, snapshots,
UTF-16 ranges, quotations and rationales, including multiple sources for one statement. Quotations
guard review input; only reviewer and rationale are retained in transaction metadata.

Compilation validates unique quotations, historical ranges, unchanged baseline, duplicate reviews,
source eligibility and self/circular evidence. It checks actual historical containment rather than
trusting a candidate's label. Direct enrichment input and citation readback share the Wiki source
boundary. Compilation writes `evidence-review.json` and `review-report.json`, including the queue
of unsupported blocks. Private packets, decisions, quotations and exclusions belong in the private
vault, outside this public application repo.

Enrichment reads committed Git history and emits new envelopes, `request.json` and `report.json`
into a fresh directory outside the vault. It cannot publish. Output is valid immediately after the
exact baseline it was prepared against; regenerate if the vault advances. Deterministic identities
and requests permit retry without duplicates. Before output, verification checks retained nodes
and text, new schemas, containment, historical readback and idempotence.

The original `migrate` / `migrate:verify` commands independently check historical Markdown import in
scratch output. They must not replace published history or invalidate its exact addresses.

## Private migration handoffs

Retain migration packages in the private vault under `.vaulter/migrations/wiki/<date>/`.
Each package's `HANDOFF.md` records its baseline, canonical review/output, outstanding work and
verification; its manifest and checksums preserve integrity. Session-specific review details and
private content stay in that package.

The staging directory is separate from the live `.vaulter/nodes/v1/transactions/` namespace.
Saving a package does not apply its proposed transactions. Before the full migration, pull the
latest vault and regenerate/validate against the intended publication baseline. Verify the saved
package before removing redundant temporary copies outside the vault.
