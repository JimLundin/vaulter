# Distinguish retained deleted states from supporting evidence

Relationships, provenance and History may need to identify a record in a Snapshot where it was
already deleted. We retain this as a separate Retained state reference rather than relaxing the
Historical reference used for supporting evidence: existence and type at an accepted snapshot
suffice for the former, while the latter still requires availability under ADR 0005.

Store exports the distinct `vaulter-eav-retained-state-v1` address and validates schema-defined
`e.retainedStateRef()` attributes at acceptance and durable replay, including identity, type,
selected transaction, journal and storage scope. Resolution reports live/deleted status without
restoring the record or executing effects. Existing evidence formats and owner fields keep their
meaning; replacing their kinds requires explicit migration, while an optional new attribute is
compatible. Private source translation targets these native contracts under ADRs 0007 and 0014.
