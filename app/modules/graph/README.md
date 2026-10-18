# Graph

Graph reads native typed EAV `Relationship`, `Term` and `Query` records and explicit `Topic` organization from [the owner schema](records.ts). A page becomes a Topic only through an attributed promotion. Membership is editorial organization; it does not assert a factual relationship.

[readGraph](reading.ts) pins its projection to one accepted transaction. Directed connections retain exact historical source and target references, including after later edits or removal. Vocabulary supplies outgoing, inverse and symmetric labels. Ambiguous predicate definitions remain inspectable and fall back to the predicate key. Self connections appear once; bounded breadth-first traversal stops cycles while retaining distinct snapshots of one identity.

Native relationship candidates retain any known predicate, label and endpoint addresses, explicit
unknown direction and a clarification reason. Source-document provenance preserves the external
source's selected state. Imported and newly captured candidates use the same admission contract.
Candidates appear in the Graph Clarify tab and reusable `RelationshipCandidates` presentation;
clarification, resolution and revision preserve the record identity. Availability is independent
of uncertainty. Explicit candidates never become traversal edges or classifications before
resolution. Label-only connections require clarification before they can classify a record.
Optional schema extensions permit existing directed records and journals to reopen unchanged.

[graphActions](operations.ts) accepts connections with trusted attribution and validated historical endpoints atomically. Unresolved targets retain a label. Removal marks a connection unavailable while retaining accepted history.

[The explorer](explorer.ts) subscribes to the EAV database, retains previous results after a failed refresh and rejects late responses after disposal or replacement. Application supplies foreign owner descriptions and topic, content and evidence projections. [The map](map.ts) keeps shared source identities and every incident connection before filtering.

The Graph screen uses the shared NetworkDiagram and SupportingPane. Topic grouping, color, spacing, local one/two-step exploration, vocabulary and retained deep links remain available. Qualified assertions and effective-time fields remain subsequent work; historical endpoint retention does not imply an evidence review or factual qualification.
