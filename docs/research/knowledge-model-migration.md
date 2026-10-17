# Migration strategy for the proposed knowledge model

Proposal, revised 2026-10-16 for EAV and broad-topic organization. Companion to the [model proposal](knowledge-model-proposal.md) and [proposed glossary](knowledge-model/GLOSSARY.md). This describes adoption gates, not an implemented migration command. Source-specific inventories, personal examples and review decisions belong with the private source vault.

## Separate storage preservation, organization and reconstruction

Retain existing prose and original sources even when references are missing. Migrate readable structure without pretending that format validation establishes factual support. Reconstruct identities, qualifiers, effective time and evidence as separately reviewed work. A useful Wiki may contain unresolved claims, provided readers can see those gaps.

Existing published Node envelopes remain an immutable source history. EAV replaces the physical representation through an explicit conversion or retained historical reader, with a durable mapping for old identities, exact versions and snapshots. Preserve source text, transaction provenance and citation grammar. A current-state export or rerun over today's Markdown cannot reconstruct that history. Freeze a publication baseline and prove historical equivalence before switching the authoritative store.

Broad-topic organization is a separate reviewed mapping: narrower material moves under broad subjects without automatically merging its identities or rewriting its claims. Evidence reconstruction then adds qualified assertions and reviews. Each operation must be independently checkable; storage conversion does not establish factual support, and regrouping does not make an old citation support a paraphrase.

This requires explicit revisions to [ADR 0002](../adr/0002-versioned-node-model.md) and [ADR 0003](../adr/0003-github-node-persistence.md)'s storage decisions, preserving their identity, history and placement guarantees. [ADR 0005](../adr/0005-wiki-citation-selections.md)'s historical selections and source boundary remain authoritative. New knowledge and corrections append to the accepted target history rather than rewriting the preserved source history.

## Capability gates

| Gate | Vaulter capability to implement and verify | Source-vault work it unlocks |
| --- | --- | --- |
| 0: EAV preservation and publication | Owner entity schemas; durable identity/address mapping; exact-version and snapshot reading; ordered/shared content; cross-owner references; historical schema interpretation; durable acceptance, baseline checks and finalized-request recovery | A reproducible storage conversion retaining old links, citations, transaction provenance, deletion/restoration and source text |
| T: broad-topic organization | Explicit topic promotion and membership distinct from page existence; bounded neighborhood queries and on-demand Graph expansion | Fewer generated top-level topics, narrower material grouped beneath them, retained endpoint identities and operational-content exclusion |
| A: retained sources and evidence visibility | Captured external passages; current/historical source reading; selected-text support indicators; summary field-text selection | Recover references, split mixed assertions, keep unresolved text visible, review summaries |
| B: qualified graph knowledge | Graph-owned predicates, endpoint identity, modality, attribution and effective time; whole-assertion selectors; deliberate cross-domain Evidence ownership | Review existing relation labels, reconstruct missing edges, resolve ambiguous names without inventing facts |
| C: time and lifecycle | Shared honest time contract; Event, Decision and Task admission; separately reviewed Outcomes and decision supersession | Distinguish plans from occurrences, commitments from wishes, and later state changes from original adoption |
| D: interpretations and questions | Readable attributed interpretations; corrections; review issue routing through Questions | Retain reasoning, resolve ambiguity, record new confirmations and reopen stale issues where appropriate |

Preparation can start before these gates: inventory sources, draft topic mappings, find passages, draft assertions and record unresolved questions. EAV cutover requires gate 0; publishing the new organization requires gate T; publication into a new knowledge domain additionally requires its owner, historical decoders and validation. These gates need not become large releases; source capture and paragraph evidence can land independently, and all owners can share one composed review surface. Existing verified Node refreshes remain separate operations until cutover; they are not EAV migrations.

Gate 0 includes restart and uncertain-acknowledgement scenarios, not just an in-memory transaction test. Opaque entity objects must have durable address/receipt counterparts. Historical claim and passage selections must retain both their exact versions and the snapshots used to resolve children and references. Reference sets cannot substitute for ordered content. Datetime attributes cannot substitute for imprecise domain time.

Gate T must show that grouping multiple narrower pages under one broad topic produces one global topic while keeping all narrower records searchable and directly reachable. Merely nesting pages or filtering an already constructed full graph is insufficient. Bound retrieval and diagram construction, retain shared identities across memberships, disclose omitted records and permit deliberate expansion. Measure topic, fetched-record, rendered-record and edge counts independently.

Gate A must cover partial ranges: a cited clause must not clear warnings on the rest of a paragraph, and page provenance must not clear any statement-level warning. Gate B must retain expectation modality after review. Gate C must require new evidence for completion or occurrence; elapsed deadlines and deleted frontmatter are insufficient.

## Content mapping

| Existing material | Proposed destination | Judgment required |
| --- | --- | --- |
| Topical prose, lists, tables and ordinary links | Wiki content under reviewed broad subjects, with EAV identity and ordered-placement mapping | Preserve order and links; select assertions; distinguish navigation from claims; narrow overstatements |
| Narrower pages, concepts, tools, people and places | Sections/attached material and retained subject identities; explicit topic memberships | Decide promotion independently of identity; resolve aliases without merging distinct subjects |
| Page summaries | Existing summary field plus new field-text evidence selection | Review actual summary wording independently of body support |
| Captures, conversations, daily accounts and agent reports | Existing source owners with provenance and original attribution | Distinguish verbatim speech, recorded account and attributed report |
| External URLs | Source lead; captured excerpt becomes a Source document | Verify the retained passage supports the selected claim and its context |
| Relations and aliases | Existing identities plus reviewed qualified Graph records | Resolve endpoints, direction, predicate, modality and time; keep ambiguous mentions pending |
| Dates and recurring dates | Owner-approved time values and Events where warranted | Preserve precision, approximation, recurrence and unknown values |
| Decisions and follow-ups | Decisions, Tasks and later Outcomes | Establish adoption or commitment, responsible actor, rationale and later evidence |
| Opinions, inferred explanations and corrections | Attributed prose or Interpretations linked to underlying passages | Preserve reasoning and reporting chain; do not treat derivatives as corroboration |
| Open questions | Existing Questions, connected to bounded review gaps | Establish what an answer resolves and what remains open |
| Charts, benchmarks, timelines and note lists | Existing presentation initially | Review data provenance and context; add dataset/query models only for unmet operations |
| Repository policy and importer instructions | Source-vault operational material | Decide inclusion by translation policy rather than inventing a knowledge domain |

## Topic mapping and generation

Build a private mapping before changing organization. Each entry identifies the old subject/content
identity, destination broad topic, disposition (promoted topic, narrower content, retained endpoint or
operational material), rationale, aliases, relevant links/citations and unresolved decisions. Preserve
old direct links through the address mapping. Do not delete an identity simply because its material
no longer warrants a standalone topic, and do not count identity retention as topic promotion.

Default new material to an existing topic. Promote only recurring, independently useful areas of
inquiry or activity that existing topics cannot represent clearly. A file, tag, heading, mentioned
entity or extracted statement is not an automatic topic. Resolve existing names/aliases first; keep
uncertain identity assignments pending. Use a primary membership for navigation and additional
explicit memberships where useful, without copying shared content or creating factual edges.

Review a small curated topic set with a connected pilot, then expand it only where needed. Preserve
substance and addressability rather than meeting a quota by deleting content. Source conventions
that require a note or stub per concept must not determine target topic count. Once the target policy
is adopted, update ongoing extraction/refresh policy so subsequent captures do not recreate the
consolidated topics. Operational material stays outside ordinary topic generation while its published
history remains available.

## Review and reuse

Each reconstruction entry needs a stable ID, exact existing assertion, proposed wording or semantic projection, candidate identities, source passages with versions/snapshots, attribution, original time expression, reviewer/result/rationale and unresolved questions. Record the intended owning action and feature gate so an accepted draft cannot accidentally be published through a generic writer.

Historical citations remain available when current knowledge changes. Carrying a judgment forward is a distinct operation: verify selection semantics, source eligibility, assertion content and all meaning-bearing dependencies. Paraphrased prose, changed identity, predicate meaning, modality or effective time require review. New selector semantics require a new format and compatibility checks. A translator may conservatively invalidate all receipt reuse after a target revision change; implement an explicit migration/revalidation policy before promising cross-version reuse.

Start with a connected pilot containing a public definition and personal stance, an expected relationship, an identity correction, a superseded decision and an unresolved task outcome. Include several narrow pages under one topic, a shared source across topics, ordered/repeated content placements and an old citation whose source is later edited or deleted. Review the passage-level assertions before rewriting the surrounding pages. Then expand by connected subject/project clusters so evidence and identity decisions remain coherent across pages. Preserve missing-evidence entries rather than blocking an entire vault until all claims have references.

## Publication contract

The source vault owns translation under [ADR 0007](../adr/0007-vault-owned-translation.md). Vaulter owners supply admission, validation and historical reading. EAV integration must preserve [ADR 0009](../adr/0009-scoped-transaction-writes.md)'s trusted admission and finalized-request recovery, with Application composition supplying dependencies rather than direct workflow imports. Callback transactions alone do not provide the durable publication protocol. The target engine owns its import/acceptance interface; the private translator owns source-specific identity mapping and extraction policy.

For each batch:

1. Pin an implemented Vaulter revision and commit the intended translator/source inputs. Record which capability gates it passes; a design branch or uncommitted engine is not a publication target.
2. Capture the exact published prefix, source revision, target revision, tooling bytes and runtime provenance. Generate a new scratch proposal against that baseline, including durable identity/transaction mappings and the reviewed topic dispositions.
3. For the initial EAV conversion, retain original envelopes and verify all historical addresses, snapshots, ordering, attribution and citation selections through the target reading path. Preserve original recording times separately from cutover time. Establish one authoritative writer after cutover and a recovery procedure that accounts for any subsequently accepted EAV writes.
4. Revalidate reusable reviews; leave changed or unsupported assertions explicit. Check identity, chronology and outcome semantics as well as attribute shape. Verify topic membership without duplicate content or inferred factual relationships.
5. Verify owner admission, unchanged historical transcripts, historical citation reading after edits/deletion, current domain readback, bounded graph behavior and empty retry of the finalized request. Reopening after a lost acknowledgement must recover the same accepted operation without duplicate entities or replayed effects.
6. Publish through the source-vault procedure and the target backend's verified acceptance contract. Existing Node append commands cannot be assumed to perform EAV cutover. If any input or published baseline changes before publication, regenerate rather than editing envelopes or forcing retries.
7. Rebuild coverage and review queues from the resulting snapshot. Report claim support, unresolved identities and lifecycle outcomes separately; a count of pages with citations is not a support percentage. Report promoted topics and fetched/rendered graph records separately from total retained entities.

The first success criterion is a trustworthy pilot, a verified EAV preservation/cutover path and repeatable subsequent publication. Broader completion means every source category has an explicit retention/mapping policy, every promoted assertion has a reviewed domain meaning, every topic has an explicit organizational purpose, and every unresolved claim remains visible and actionable.
