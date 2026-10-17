# Use one EAV journal for the entire Vault

Every application producer, reader, history view and preview uses the typed EAV store and the
owner-defined model. Keeping two authorities would leave attribution, evidence and recovery
split across independent acceptance boundaries. This decision completes ADR 0010's engine adoption
and supersedes ADR 0002 and the coexistence and compatibility provisions of ADRs 0009–0012.

Application composes owner schemas once. Independent voice records the same Agent runs, inputs,
model steps and tool outcomes as text execution. Graph relationships and Questions context retain
validated historical EAV references. History reads the single journal. Session replacement,
credential changes and sign-out manage its one persistence lifecycle.

Published history remains immutable; domain corrections append new transactions. Private source
translation under ADR 0007 targets the current typed owners and must separately verify evidence,
identity and chronology. Application opening performs no source conversion. ADR 0005's historical
text projections and evidence boundary remain binding.

Retired models and compatibility definitions do not constrain current module interfaces. The unused
`chat.migration` definition is removed rather than retained solely to open older journals. A journal
requiring retired schema must be converted separately by private source tooling before opening;
application opening does not translate, reset or silently discard accepted data. Current recorded
activity and historical references remain supported by their owning modules.
