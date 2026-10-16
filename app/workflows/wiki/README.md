# Wiki

The private Vault owns [translation and enrichment tooling](https://github.com/JimLundin/vault/tree/main/.vaulter/tooling/migration).
It interprets old files and Git history, chooses extraction and review policy, and targets the current
Vaulter modules. Private content, review packets, examples and operational commands live in the
[Vault runbook](https://github.com/JimLundin/vault/blob/main/.vaulter/tooling/wiki-migration.md).

Vaulter owns target records and their interpretation. Wiki is distilled knowledge; its citations
and page provenance refer to retained conversations, reports or independently captured material.
Wiki pages and their descendants remain navigation and retrieval targets. Their prose cannot serve
as evidence, including when linked from another page. Eligibility follows historical containment.

## Current module interfaces

| Owner entry | Responsibility |
| --- | --- |
| [Wiki records](./records.ts) | Validate page, block, inline and Citation payloads with `parseWikiRecord` |
| [Wiki preparation](./preparation.ts) | `prepareWikiReferences` prepares references and reviewed citations without publishing |
| [Wiki evidence](./evidence.ts) and [citations](./citations.ts) | Validate source eligibility, historical selections and current claim applicability |
| [Wiki pages](./pages.ts) | `readWiki` projects accepted history into pages and resolved references |
| [Related content](./related-content.ts) | Required snapshot-scoped reading supplied by Application for classifications, relationship labels and query results |
| [Source reading](../../vault/sources.ts) | `SourceReader` lets callers compose the historical text and descriptions supplied by record owners |
| [NodeStore](../../vault/nodes/store.ts) | Read snapshots and atomically append structurally valid transactions |

Chat, Agent, Content and retained record owners interpret their own payloads. Application composes those
readers for the application; Vault tooling composes them for ingestion. Source-specific parsing,
retrieval, ranking, identity allocation and authorship stay with the translator. A richer extraction
strategy can retain more source material and propose new records; the target module validates those
records using its current definitions.

Graph owns Relationship, Term and Query interpretation. Application supplies `applicationWikiGraph`
to `readWiki`, `createWikiReading` and `useWikiReading`; the reader constructs that interpretation
from the same Snapshot as the pages. Wiki supplies live page candidates and renders the returned
classifications, labels and query links. It never imports Graph or repeats predicate/term decoding
and query filtering. Connection source determines classification independently of placement; an
exact source applies only to its addressed page version. Deleted identity Terms remain visible as
unavailable metadata but do not classify query candidates; exact live Term references remain usable.

Wiki still decides whether a `source` relationship is eligible page provenance, just as it decides
source eligibility for ordinary links. That is Wiki's evidence policy, rather than general Graph
classification or query behavior. Citations and page containment remain Wiki-owned.

The tooling pins Vaulter at `.vaulter/tooling/vaulter/` and maps `#vaulter/*` to existing source entries
in that revision. Advancing the pin requires adapting and verifying the consumer. These entries are
current source interfaces; they do not promise a separately versioned migration SDK.

## Historical selections and preparation

[ADR 0005](../../../docs/adr/0005-wiki-citation-selections.md) defines citation history. Each exact claim and passage
address has a snapshot sequence and a nonempty half-open UTF-16 range. Exact container versions do
not freeze their children; the snapshot selects their historical descendants. Quotations are derived
from history. Inline fragments concatenate verbatim, blocks use newlines and table cells use tabs.
Structural references add no text; ranges cannot split surrogate pairs. Changed text projection
semantics need a new selection format, preserving the grammar of existing `unit: 'utf16'` selections.

Page references establish provenance without asserting support for a statement. Reviewed citations
must establish the entire selected claim. Retrieval and lexical overlap identify candidates; source
eligibility and referential integrity alone do not prove support. Historical source context survives
later edits and deletion; an edited claim withholds support when its current text differs.

`prepareWikiReferences` returns `baselineSequence`, proposed changes and expected reads. The caller
must publish against exactly that baseline or reprepare: descendant version expectations cannot
detect newly inserted children. The caller supplies every selected Citation version, including
those beneath deleted containers. Preparation checks reviewed quotations against history and
validates evidence before output. It does not publish or choose import identities and authorship.

The published import is immutable. Enrichment and upgrades append transactions, preserving existing
addresses and historical selections. Future modules may change payloads and structure while supplying
explicit historical decoders; the original import does not freeze their design.
See [ADR 0007](../../../docs/adr/0007-vault-owned-translation.md).
