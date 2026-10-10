# Agent-owned records

The Vault is the collection of nodes in NodeStore. Agent execution produces records in that
collection independently of Chat. The separate Vault migration can populate these same payloads
and relationships; the application does not translate or import the existing Vault.

## Initial acceptance

An `agentRun` has a stable identity and records `started`, `status`, `provider`, requested/served
`model`, JSON `settings`, and `enabledTools`. Established optional request, finish reason, timing,
usage, cost and error fields retain their meanings. Unknown JSON fields survive validation.
Agent owns these schemas. Chat historical metadata decoding delegates to them without reexporting
execution ownership; new Chat metadata production cannot create execution records.

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
Module-owned tools use durable invocation/outcome gates and the recovery described below. The
caller supplies capabilities explicitly; Agent introduces no global execution queue.

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
its invocation/outcome stage and retained execution data. Retry saves the retained completed result
without replaying tools; Stop drains entered work and preserves pending obligations. Reopening
exposes recorded running invocations unchanged.

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

## Tool outcome recovery

The independent Agent handle can retry a paused tool outcome while execution is still open. Retry
submits the unchanged prepared write, including its transaction identity and attribution. After
acceptance the same executing call resolves and provider continuation resumes; the module is not
invoked again. Failed tool outcomes use the same recovery path and preserve their original errors.
Lost acceptance responses reconcile through NodeStore's complete idempotent request identity.

The live state distinguishes persistence stages (`initial`, `invocation`, `content`, `outcome`,
`terminal`). Outcome failures retain `pendingTool`. Content publication failures retain their
attributed request and error separately. A snapshot refresh failure after accepted content remains
an observable context error; it does not convert accepted publication into a failed tool receipt.
No automatic content retry claims exactly-once effects for arbitrary external tools.
The explicit `retryContentSave` operation resubmits only the immutable attributed NodeCommit;
`contentAccepted` acknowledges its acceptance separately from the original tool outcome. It never
repeats external effects or fabricates a successful receipt. `refreshContext` retries reading current
nodes, retaining declared stale-read dependencies and never reviving stopped tool access. Content
and refresh diagnostics coexist with independent tool/terminal save obligations.

Stop immediately expires new and queued publication, waits for already entered effects and
writes to settle, and preserves their known outcomes. When outcome persistence remains unresolved,
Stop returns the retained save obligation rather than inventing completion. Persistence recovery
remains usable on the stopped handle: accept the outcome, then record the stopped run without
starting another tool or provider step. Terminal persistence is a distinct stable retry request.

Invocation persistence recovery is persistence-only: when no module execution began, recording
the invocation does not start it later. The run retains an explicit `invocationNotExecuted` finish
reason and interrupted status. Historical readers do not infer that fact from absent output.
An unfinished recorded tool exposes `effects: uncertain` while retaining its running payload;
completed records expose `effects: recorded`. This is a read projection, not another stored model.
Available local ownership may prove that a controller is live. Missing local ownership leaves
remote liveness unknown and never establishes abandonment or causes automatic replay.

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

## Existing live voice execution

Agent's execution provider accepts either a streamed text model or an externally driven live
protocol. Both receive the same accepted context, guarded module tools, durable invocation/outcome
wrapper, Stop and persistence recovery. Voice uses the established live connection callbacks;
provider protocol handling does not understand Chat payloads or require conversation identities.
It introduces no second persisted run or tool representation.

Voice declares explicitly supplied tools before opening media, using an expired context that
cannot read or publish. Each accepted spoken input receives fresh guarded tools whose names,
descriptions and schemas must match those declarations. Local validation transforms arguments
once before execution; the durable invocation retains effective arguments. Effective voice
instructions and the ordered user, assistant and tool history are retained as `contextInput`
children before the provider can request a response or execute a call.

The caller may provide `prepareTurn` to combine its own initial records with Agent's supplied
context and selected tools in one transaction. Its `onResponse` callback owns transcript
projection and publication. The callback receives a stable projection ID; retain a complete
prepared transcript request under that ID and reuse it on retries. Agent retains the callback
arguments after a save failure without regenerating the ID or repeating execution. Transcript
status is supplied separately so buffered playback interruption need not rewrite an already
accepted Agent execution outcome.

A tool outcome-save failure holds the actual execute promise and provider continuation until
persistence-only recovery accepts the retained outcome. Interruption and Close expire executable
access immediately, settle started effects and short commits, and preserve pending save handles.
Closing a paused protocol does not wait indefinitely for Retry and never sends a late fabricated
tool failure or requests another response. Reopening supplies history as data without executing
unfinished invocations. Local protocol ordering is scoped to its session; unrelated voice and
text runs share no whole-Vault lifetime queue.

`createOpenAICapabilities` in `app/agent/openai/index.ts` retains the existing configured Responses,
live voice, live transcription, file transcription and embedding capabilities. Responses request
`store: false`; session credentials stay in provider transport closures. Chat's established model
and transcription imports remain compatibility delegates. Media and protocol tests use fictional
channels, tracks, HTTP responses and the production memory NodeStore, with no microphone access or
paid model calls.

## Operations and compensation preservation

Agent owns `agent.startRun`, `completeRun`, `stopRun`, `recordTool` and `completeTool`. Initial
acceptance uses the caller author; execution/tool outcome transactions use the stable Agent author
and run origin. Run/context/tool nodes and exact-reference descendants remain readable through
generic history and snapshots independently of installed execution providers.

`preservesAgentRecords` rejects compensation involving run/context/tool payloads on either side.
It conservatively retains every `metadataReference`, including references shared with other
producers; this prevents losing exact execution evidence without inferring ownership from JSON
strings. Product composes it with Chat's transcript/provenance and content module's supported
compensation policy. History imports no producer. Generic storage can retain unknown kinds and
operations even when a removed producer decoder is unavailable.

Legacy Agent metadata may be siblings under an exchange rather than children of a run. Chat's
historical metadata reader delegates those payloads losslessly to Agent schemas; new production
uses Agent preparation. Generic History reads the original versions, while `readAgentRun` follows
the current run-child context/tool layout and does not invent missing relationships or outcomes.

## Persisted layout

| Payload | Required content | Placement and exact links |
|---|---|---|
| `agentRun` | started, status, provider, model.requested, settings, enabledTools | Unplaced or under caller origin; source exact initial run, target exact Agent configuration |
| `contextInput` | role, position, transformation, content | Run child ordered by position; optional text selection |
| `toolExecution` | call, name, attempt, started, status, input | Run child ordered by invocation; source exact initial run, target exact initial invocation |
| `metadataReference` | role `suppliedContext` | Context child; source exact context version, target exact supplied evidence version |

Run terminal versions retain ended time and optional served model/request/finishReason/timing/usage/
cost/error/output. Tool outcome versions retain ended/elapsedMs and output or structured error as
available. Optional unknown JSON survives known-shape validation at every supported ingress. Stored
running status is separate from live accepting/running/paused/unsaved/recorded handle phases; recovery
and ownership projections never rewrite accepted history merely because a controller is absent.
