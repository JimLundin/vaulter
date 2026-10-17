# Use EAV for one continuous dialogue and independent Agent execution records

The product has one ongoing native user-agent Conversation per Vault. Topic and date changes append
to it. The earlier branch implementation preserved titled, selectable chats and copied Agent output
into Chat messages; that interpretation was wrong and is replaced by this decision.

The reference is the [Pi Durable schema investigation](https://github.com/JimLundin/vaulter/blob/23d183c/docs/research/pi-durable-schema.md).
Its useful separation is retained dialogue, effective model context and execution state. One dialogue
per Vault is Vaulter's product decision, not a Pi storage limitation. ADR 0010 supplies the typed EAV
engine; the research note's Node-specific physical layout is superseded by that decision.

Chat owns the single Conversation identity, ordered Exchanges, canonical submitted Messages and
RetainedSource records. A stable submission key lives on its Exchange for admission deduplication;
there is no separate queued Submission lifecycle or persisted conversation routing entity. Concurrent
admission uses EAV's atomic conflict check. Subject titles and device preferences cannot create scopes.

Agent owns configuration, runs, ModelSteps, effective inputs and canonical ToolExecutions. Chat
projects the run's responses and tool references; it does not save a second agent message or tool
outcome. Each observable text request retains accepted inputs/configuration before execution and a
response before the next step. The adapter explicitly versions its application-message input format
as `ai-sdk-model-messages-v7`. This is not a raw HTTP request. Opaque external providers retain known
run-level records, without invented per-request receipts. Provider-internal attempts remain unknown.

The independent GitHub EAV adapter publishes immutable transaction envelopes with schema revisions
under `.vaulter/eav/transactions/`, preserving unrelated Node/content paths through Git ref CAS.
The device cache supports offline reads; writes require remote acceptance. Uncertain saves retain
exact publications. Stop, retry and historical reads do not replay models or tools. Session disposal,
credential changes and sign-out cover EAV storage. No automatic execution scheduler is introduced.

A one-time importer captures earlier chats into the target retained-source contract, preserving known
speaker/status/content, old grouping and exact immutable Node versions as provenance. It does not
manufacture model steps, authors or outcomes. Its deterministic source ordering is presentation order;
each historical contribution is ordered by its message instant, then original placement and identity.
Old containers are not timeline boundaries. Recorded date precision remains available, and day-only
accounts do not display an invented clock time. Ties retain their uncertainty. Normal chat readers
subsequently use only EAV. Original Node history remains for exact evidence and other modules' gradual migration.

The production UI and default preview reopen the same dialogue and retire New/Open conversation
selection. A conversation timeline retains navigation within that single dialogue. Existing draft, capture, submission and recovery ownership remains in the retained Chat
interaction. The legacy Node backend is a compatibility seam for independent callers/tests, not an
alternative production chat mode. Independent voice entry points remain a subsequent producer migration.

Unmigrated content tools still need Node authors, origins and exact citation endpoints. Immutable
`externalRecord` run backlinks and message excerpts provide those compatibility references. They do
not own dialogue or execution. These writes have separate recovery; there is no atomic transaction
across Node and EAV stores. Generic History UI remains a subsequent migration; EAV history is queryable
through the database interface now.

Context checkpoints are created explicitly from the recorded prefix of the dialogue by a separate,
tool-free Agent run. Its accepted inputs retain the exact source projection. A checkpoint records
its covered Exchanges, source fingerprint, title and summary, and references the generating run.
The timeline displays both Exchanges and checkpoints; navigation only changes the viewport.

New Chat runs select the furthest applicable checkpoint, append subsequent activity and use current
instructions. RunContext records the selected checkpoint and tail Exchanges, while ContextInputs
retain exactly what was supplied. Changed source evidence invalidates checkpoint use, without
removing the summary or original conversation from history. Failed saves retain a persistence-only
retry; reading and reloading never resume generation. Checkpoint summaries are background evidence,
not a replacement for current instructions or proof of successful execution. Incomplete activity
retains its observed status; any later outcome changes invalidate the older summary's coverage.
A recorded readConversationHistory tool can retrieve original activity by position without replay.

Automatic checkpoint scheduling, context budgets and bounded tool projections remain subsequent
work. This implementation exposes explicit checkpoint generation, without a background scheduler.
