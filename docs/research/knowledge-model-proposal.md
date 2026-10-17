# Knowledge model direction

Native typed EAV adoption is recorded in [ADRs 0010–0014](../adr/0014-eav-only-vault.md), and current
owner contracts are documented in [the data model](../data-model.md). This note retains the design
reasoning and future domain work from the knowledge proposal; physical-store adoption is complete.
Canonical accepted vocabulary is in the root [glossary](../../GLOSSARY.md).

## Knowledge, identity and organization

Keep Wiki prose as prose. A Claim is a reviewable assertion, not a mandatory entity for every sentence.
A selected sentence, page summary or future structured relationship can provide a reviewable assertion
without copying everything into a universal claim store. An EAV fact records an attribute value and
never establishes the truth of a claim about the world.

Subjects reuse suitable retained owner identities. Broad Topics are explicitly promoted subjects used
for recurring organization. Membership is editorial: grouping a person or narrower subject under a
Topic asserts no factual connection. Search descriptions derive from owner records. Graph remains an
exploration projection with bounded retrieval, explicit omissions and deliberate expansion.

## Evidence and sources

Independently captured SourceDocuments retain text, origin and available attribution. Chat and Agent
retain their own canonical source activity. Wiki content cannot corroborate itself. Page references
state provenance; reviews assess exact selected assertions against retained passages. Support and
contradiction can coexist, and partial passage coverage leaves unselected clauses unsupported.

Selected text retains an accepted snapshot, explicit projection format and UTF-16 range. Changed
selected wording requires review; old reviews and passages remain readable after later edits or removal.
Retrieval rank, reference counts and model confidence never substitute for a support decision.
A re-fetch retains a new source state without replacing an earlier cited passage.

## Future qualified knowledge and time

Qualified relationships should retain resolved subject/object identities, predicate meaning, direction,
modality, attribution and effective time. Preserve unresolved labels separately until reviewed.
An expectation or intention must not become an accomplished fact because its wording was imported.
Whole-assertion evidence selectors should review semantic content independently of incidental layout
or names; changing projection semantics requires a new selector format.

Domain time must preserve precision, approximation, recurrence and unknown boundaries. Recording time
cannot substitute for the time a claim describes. Events, Decisions and Tasks need owning admission
contracts; completion or supersession requires new evidence. Interpretations and corrections retain
who made them and which material they interpret, coexisting with original evidence.

Questions can route ambiguity and missing evidence to a person. An Answer can resolve its Question
without certifying unrelated assertions or modifying a linked Review automatically. A combined review
queue, qualified structured assertions and interpreted lifecycle records remain future owner work.

## Publication and boundaries

All accepted changes use typed owner schemas, trusted attribution and one atomic journal. Model/tool
execution stays outside transaction lifetimes; uncertain saves retry finalized publications without
replaying effects. Application composes independent owners and shared presentation.

Private source translation and reconstruction follow [ADR 0007](../adr/0007-vault-owned-translation.md)
and the [source translation principles](knowledge-model-migration.md). Its pinned consumer adapts to
current interfaces. Application startup does not import sources or regenerate accepted history.
[ADR 0005](../adr/0005-wiki-citation-selections.md) governs historical text grammar and source eligibility.
