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

## Module-owned tools

A caller supplies an explicit tool factory and accepts each selected name/version in the initial
run's `enabledTools`. Agent installs that exact set and no default content tools. Supplied tools
must execute in their owning module, rather than delegate an unrecorded effect to the provider.
The module owns its input schema, content payloads, operation validation and publication choice.
Agent owns the run and tool activity, not a universal staging or review rule.

Each `toolExecution` is a stable child of its run. It retains call identity, name/version, attempt,
arguments, timing and status. Its connection source identifies the exact initial run version and
its target identifies the exact initial invocation version. Invocation acceptance happens inside
the actual executing tool wrapper, before module execution. Completion versions only that tool
node with immutable JSON output or a recorded execution error. Calls within one run execute in
order, so an outcome awaiting acceptance prevents later effects and provider continuation.

A write failure exposes `paused`, a persistence error and an immutable `pendingTool` request,
its invocation/outcome stage and retained execution data. This slice does not replay tools or
fabricate a result. Full persistence retry, Stop and in-flight drain recovery follows in the
dependent outcome recovery ticket. Reopening exposes recorded running invocations unchanged.

The supplied execution context provides cancellation, guarded NodeStore reads and publication
with the stable Agent author and run origin. Model input cannot override those identities or
undo attribution. Changed-node expectations and declared identity/children reads reject stale
publication atomically. Exact evidence reads preserve their version without silently rebasing.
Parent and returned-child reads do not establish protection against a new concurrent child;
a module requiring stronger coordination owns it.

Agent protects its own run, context and tool records, including placed reference descendants.
The caller composes any additional producer record policy, such as preserving Chat transcripts.
A content module can therefore create a valid Interpretation and exact evidence links while
existing execution references remain protected. The same context supports a module publishing
content immediately and another module recording a proposal, without imposing either choice.

## Independent runs and ownership

Unrelated runs load models, stream and invoke tools concurrently. Agent has no queue or lock held
across the Vault during execution. NodeStore still accepts short atomic transactions, allocating
distinct definitive sequences and rejecting the whole transaction when a changed-node expectation
or declared read has become stale. A supplying module can coordinate its own operations by
wrapping them before passing its tools to Agent. Reading a parent and its existing children does
not protect the absence of a future child, so stronger operation predicates belong to that module.

Within the same NodeStore instance, simultaneous starts for the same prepared run share one
controller. The complete prepared request must match, including caller-composed changes and
expectations. This is local deduplication, not a cross-tab/device lease or proof that arbitrary
external effects run exactly once. Backend disposal stops only controllers it created; another
reader sharing a controller does not acquire its disposal ownership.

Current reads expose `ownership: 'live'` when a local execution or recovery controller remains
available. A paused or unsaved controller can be live while its model is not progressing. The
value is otherwise `unknown`, including historical snapshots and runs on another NodeStore
instance. Unknown ownership does not prove abandonment, and neither value rewrites the accepted
run status or resumes execution. Disposing an owner expires execution and releases its evidence
once any work already in progress has settled.
