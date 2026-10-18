# Wiki

Wiki uses the [native EAV model](RECORDS.md): pages, independently addressable content, ordered
appearances, page provenance and selected-assertion reviews. Pages can serve as Subjects; Graph owns
explicit broad Topic promotion and membership. Page creation does not automatically promote a Topic.

Content availability is explicit. Removing content retains appearances and descendants; restoring it
reveals current descendant content. Removing an appearance affects that placement. Editing shared
content updates every appearance without versioning ancestors or siblings. Owner actions reject
containment cycles and incompatible placement. Application composes related Graph and source reading
through owner interfaces rather than duplicating their interpretation.

Evidence reviews retain validated historical EAV references, projection formats and nonempty half-open
UTF-16 ranges. Support applies only to selected text; page-wide provenance does not support a sentence
or summary. Changed selected text requires review. Original passages survive source edits or removal.
Retained conversations, reports and captured SourceDocuments are eligible sources; Wiki prose cannot
corroborate itself. Support and disagreement can coexist. [ADR 0005](../../docs/adr/0005-wiki-citation-selections.md)
defines the historical text grammar and source boundary.

Vaulter owns typed records, admission, reading and UI. The private Vault owns source translation,
identity mapping and enrichment under [ADR 0007](../../docs/adr/0007-vault-owned-translation.md).
Its pinned consumer adapts to current owner interfaces; application opening does not convert sources
or reset history. Private content, review policy and publication procedures remain in that repository.

Production, tools, Search and fictional previews read accepted native entities. Focused checks cover
localized placement, availability, historical source selections, partial evidence and review admission.
