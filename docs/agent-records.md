# Agent-owned records

The Vault is the collection of nodes in NodeStore. Agent execution produces records in that
collection independently of Chat. The separate Vault migration can populate these same payloads
and relationships; the application does not translate or import the existing Vault.

## Initial acceptance

An `agentRun` has a stable identity and records `started`, `status`, `provider`, requested/served
`model`, JSON `settings`, and `enabledTools`. Established optional request, finish reason, timing,
usage, cost and error fields retain their meanings. Unknown JSON fields survive validation.
Agent owns these schemas; Chat keeps compatibility exports for its existing record consumers.

The initial version is `running`. Its connection source is its own exact initial version and its
target is the exact Agent configuration version supplied by the caller. The stable Agent identity
is the author of later execution transactions. A standalone run is unplaced; a run associated
with caller context can be placed below that context. No conversation or Chat exchange is required.

`contextInput` children retain the effective provider inputs, role, position, transformation and
optional text selection. String content is passed verbatim. Structured content retains the
existing `{ message: <effective model message> }` JSON shape. System inputs become provider
instructions; other roles form the ordered messages. Agent does not add provider credentials to these records. Invocation settings accept the supported
JSON model settings (sampling, token limits, stop sequences, seed and retry count), rather than
SDK callbacks, tool installation or credentials. Historical settings remain arbitrary JSON.
An input obtained from a node has a `metadataReference` child with role `suppliedContext`: its
source addresses the exact input version and its target addresses the exact evidence version.
Later evidence edits do not change the supplied context.

The public preparation operation returns an immutable run identity and complete NodeCommit with
stable identities. A caller may combine its own changes and expected reads with that commit under
the same transaction ID, then pass the complete request to Agent start. Acceptance of that entire
request precedes any model loading or execution. Keep the complete prepared request for retries.

## Outcomes and recovery

Terminal execution versions only the run node, preserving containment and connections. It retains
`complete`, `failed` or `stopped` status, end time, elapsed duration, available provider request/model
and usage details, and optional JSON `output` (the text path uses `{ text: <response text> }`).
Chat may separately produce a response from that result. The outcome transaction has the Agent
identity as author and the run as origin; it neither versions ancestors nor copies Chat payloads.

The live handle exposes progress, Stop, completion and persistence-only retry. A terminal save
failure retains the execution outcome and a distinct persistence error; retry uses the same
prepared outcome without repeating the model. A failed or uncertain initial save retries only the
initial acceptance. It does not start execution after recovery.

Reopening reads recorded runs and effective inputs without execution. A previously accepted ID is
validated through NodeStore's complete retry identity, then read. A recorded `running` status
remains running: a reader without a local controller cannot prove abandonment. The live handle
reports `recorded` to distinguish a read-only accepted running record from local execution.

`toolExecution` payload ownership also moves to Agent while preserving existing fields and JSON.
The module-owned tool execution path, its durable invocation/outcome writes and recovery follow
in the dependent tickets. This slice supplies no tools and introduces no global execution queue.
