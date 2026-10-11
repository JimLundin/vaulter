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
of unsupported blocks. Private packets, decisions, quotations and exclusions remain outside the repo.

Enrichment reads committed Git history and emits new envelopes, `request.json` and `report.json`
into a fresh directory outside the vault. It cannot publish. Output is valid immediately after the
exact baseline it was prepared against; regenerate if the vault advances. Deterministic identities
and requests permit retry without duplicates. Before output, verification checks retained nodes
and text, new schemas, containment, historical readback and idempotence.

The original `migrate` / `migrate:verify` commands independently check historical Markdown import in
scratch output. They must not replace published history or invalidate its exact addresses.

## Current review handoff, 2026-10-11

Baseline: vault commit `5ab13a6cbe9bed8ed3566de1f3fd30f738cc1886`, sequence 395, 243 Wiki pages.
The bounded agent pass reviewed 225 pages with candidates; 18 had none. It considered 1,400 candidate
blocks and left 1,128 blocks without bounded candidates.

The first audit accepted 263 proposals, including 175 secondary Wiki passages. The maintainer
clarified that Wiki is distilled content, so all 175 Wiki sources are deferred to underlying-source
review. The corrected run retains 88 citations: 67 user-message passages and 21 agent reports.
The previously accepted Shape-to-Shape-Core-Thesis citation is also superseded by this source rule.
All earlier secondary-source output remains scratch history and was never published.

Private artifacts are backed up at `/home/jim/.local/share/vaulter/backups/wiki-migration-2026-10-11`.
Use the copies there if scratch directories have been cleared.

Artifacts:

- Original packets/decisions: `/tmp/wiki-agent-review`.
- Corrected decisions, review, exclusions and coverage: `/tmp/wiki-agent-underlying-sources-20261011`.
- Newly prepared underlying-source packets for unsupported blocks: the corrected directory's `next-pass`.
- Corrected verified output: `/tmp/wiki-content-underlying-sources-20261011`.

Migration modules are saved in commit `6f2d314`; the selected Wiki UI consumes their production
read projection. The next pass reviews
retrieved underlying sources and captures missing source material. Wiki-to-Wiki links remain useful
for finding those sources, without becoming evidence. The prepared enrichment has not been applied to the live vault.
