# Wiki ingestion and evidence

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
| [Wiki records](../app/workflows/wiki/records.ts) | Validate page, block, inline and Citation payloads with `parseWikiRecord` |
| [Wiki preparation](../app/workflows/wiki/preparation.ts) | `prepareWikiReferences` prepares references and reviewed citations without publishing |
| [Wiki evidence](../app/workflows/wiki/evidence.ts) and [citations](../app/workflows/wiki/citations.ts) | Validate source eligibility, historical selections and current claim applicability |
| [Wiki pages](../app/workflows/wiki/pages.ts) | `readWiki` projects accepted history into pages and resolved references |
| [Source reading](../app/vault/sources.ts) | `SourceReader` lets callers compose the historical text and descriptions supplied by record owners |
| [NodeStore](../app/vault/nodes/store.ts) | Read snapshots and atomically append structurally valid transactions |

Chat, Agent, Content and retained record owners interpret their own payloads. Application composes those
readers for the application; Vault tooling composes them for ingestion. Source-specific parsing,
retrieval, ranking, identity allocation and authorship stay with the translator. A richer extraction
strategy can retain more source material and propose new records; the target module validates those
records using its current definitions.

The tooling pins Vaulter at `.vaulter/tooling/vaulter/` and maps `#vaulter/*` to existing source entries
in that revision. Advancing the pin requires adapting and verifying the consumer. These entries are
current source interfaces; they do not promise a separately versioned migration SDK.

## Historical selections and preparation

[ADR 0005](adr/0005-wiki-citation-selections.md) defines citation history. Each exact claim and passage
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
See [ADR 0007](adr/0007-vault-owned-translation.md).

## Private migration handoffs

The Vault retains operational packages outside the live transaction namespace. Its
[runbook](https://github.com/JimLundin/vault/blob/main/.vaulter/tooling/wiki-migration.md#private-migration-handoffs)
records baselines, review artifacts, publication status and verification. Saving a package does not
apply its proposed transactions. Original import replay is a scratch verification facility;
published history is enriched through appended transactions prepared against the intended baseline.
