# Decisions

Decisions owns recorded choices: exact text, an optional supplied civil date, optional rationale
and supplied attribution, availability, and validated historical source references. A decision's
presence or age does not imply that it remains in force. Transaction authors identify who publishes
changes, independently of attribution preserved from source material.

The public interface creates, revises, removes and reads records through an Application-supplied
EAV database. Revisions append history. Removal changes availability without deleting fields or
source references. `readDecisions` can read historical snapshots and include unavailable records.
Dates preserve exact civil `YYYY`, `YYYY-MM` or `YYYY-MM-DD` precision, validated using Calendar's
time contract. Dates remain absent when unknown; no day, time, timezone or current date is manufactured.

The `/decisions/` page provides the global log and create/edit/remove actions. `DecisionList` is the
same reusable record representation available to embedded Application compositions. Foreign record
selection and joins belong to Application. Legacy note conversion belongs to private migration tooling.
