# Adopt native EAV Wiki content and selected-assertion reviews

Wiki adopts the [knowledge-model proposal](../research/knowledge-model-proposal.md): typed pages
and independently addressable content, ordered appearances for shared content, retained source
documents, and attributed reviews of exact selected assertions. A page can serve as a Subject
without a duplicate Subject entity. Graph owns explicit broad Topic promotion and editorial
membership; page creation does not promote a Topic.

This supersedes ADR 0002's physical representation and ADR 0003's persistence integration for
the new Wiki owner. Wiki production reading and writing use the EAV journal. The new model has
no Node store dependency. Existing published history remains retained outside this owner;
source-vault conversion and identity correspondence remain translator work under ADR 0007.
Opening Wiki does not execute a conversion or reset published data. Private source records
must be transferred through a separately verified publication procedure before their pages
appear in the native EAV collection.

Content availability is explicit. Removing content leaves its appearances and descendants;
restoration reveals current descendant state. Removing an appearance affects only that placement.
The engine's live references retain integrity, while schema-defined historical references retain
accepted snapshot evidence after later edits or deletion. Editing a child or moving a placement
does not version ancestors or siblings. Owner actions reject containment cycles and incompatible
parent/child kinds.

ADR 0005's UTF-16 grammar and source boundary remain binding. `wiki-text-utf16-v1` selects prose;
`wiki-summary-utf16-v1` selects the page summary field; `source-text-utf16-v1` selects native source
owner text. Each selector retains an accepted historical address and nonempty half-open range.
Source documents retain text and attribution; Wiki content cannot corroborate itself. Reviews
record reviewer, time, rationale and result, with independent supporting or challenging passages.
Support applies only to the selected text: unselected clauses and summaries retain their gaps.
Changed selected text requires review; historical receipts remain readable. Source edits or
removal do not erase retained passages. Support and disagreement can coexist.

Application composes the schemas once for Chat, Wiki, Graph organization, source documents,
Evidence records and other EAV owners. Domain readers consume only their registry subset.
Trusted actor/origin context comes from the caller, not model arguments. Owner actions finish
before network execution; uncertain publications retain `SaveError.retry` for exact save recovery
without repeating inserts or external effects. Native Wiki tools participate in canonical Agent
tool receipts and persistence barriers. The existing UI kit owns presentation and responsive panes.

This adoption implements Wiki prose/evidence and Topic organization contracts. Qualified graph
assertions, whole-assertion selectors, source-specific conversion and a complete cross-domain
Evidence review screen remain separate work. Retaining those limits avoids inventing factual
qualification or evidence judgments from old payloads.
