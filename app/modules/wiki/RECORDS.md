# Native EAV Wiki

Wiki adopts the evidence-backed [knowledge proposal](../../docs/research/knowledge-model-proposal.md)
under [ADR 0012](../../docs/adr/0012-native-eav-wiki.md). Open the owner definitions through the
application registry; use `wikiActions` with trusted author/origin context or `wikiTools` for Agent
production. `readEavWiki` projects native accepted records for the production Wiki and Search.
`createEavWikiReading` owns subscriptions, failures and disposal without owning the database.

Pages can serve as subjects. Names, summaries and aliases are attributes; identity comes from the
engine. Navigation keys are durable owner-defined keys, validated for uniqueness by actions.
Content holds typed prose/format attributes. Appearances carry content references, one page or
content parent, and explicit order. Repeated appearances share content rather than copying prose.
Removal sets availability; retained placements and descendants support restoration. Moves and
content edits change only the addressed entity. Owner actions validate content fields, parent/child
kinds and recursive containment. Reads never invoke an importer, writer, model or tool.

Reviews address selected Wiki content or the summary field through versioned UTF-16 selectors.
Source passages use an Application-supplied native source reader, with SourceDocument as the default.
Each historical-reference attribute is validated against accepted history on write and durable replay.
Selectors validate nonempty ranges and surrogate boundaries. Reviews record reviewer, time, result
and rationale; supporting citations and challenges coexist. Page references describe provenance
without asserting support for prose. Changed selected text requires review again; changed formatting
or unrelated text does not erase support for the unchanged selection. Source edits/removal retain
historical quotations. The reader exposes independent coverage, disputed and stale-review indicators.

Graph owns Topic promotion and membership in `graph/`. Page creation does not promote
broad Topics. Editorial rationale and primary membership are explicit. Topic member retrieval is
bounded before diagram construction; narrow pages remain directly reachable and searchable.

The production and preview use this same reading/writing path. The preview seeds fictional native
EAV records. Private published pages must be transferred through the source-vault publication
procedure before appearing here; opening Wiki reads the single EAV journal without converting sources.
Vaulter retains no node-store compatibility readers; private translation targets the current typed
owner interfaces under [ADR 0007](../../docs/adr/0007-vault-owned-translation.md).

Focused checks: `npm run test:fast -- app/wiki app/application/store app/graph`;
`npm run test:ui -- app/modules/wiki/wiki.browser.test.ts --project=desktop`;
`npm run test:production -- app/modules/wiki/wiki.production.browser.test.ts --project=desktop`.
