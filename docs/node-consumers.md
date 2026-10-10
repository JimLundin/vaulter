# Node consumer contracts

NodeStore provides one Vault representation. [Chat](chat-nodes.md) owns conversation/exchange/message
production and its provenance; [Agent](agent-records.md) independently owns runs, effective context
and tool executions. Product explicitly composes their initial records, models and module-owned tools.
Storage retains generic JSON, versions, attribution, placement and connections without knowledge of
producer payloads. The visible History/Search screens remain legacy file workflows, while generic
node History reads and guarded compensation are available to application callers. Sensor collection
and migration are separate work.

```text
NodeStore: Vault nodes and immutable transactions
  ├─ Chat: conversation → exchange → user/Agent messages
  ├─ Agent: independent run → effective context and durable tool executions
  ├─ Content tools: accepted content nodes and versions
  └─ History: attributed cutoffs, differences and composed guarded compensation
```

## Chat records and acceptance

`app/workflows/chat/records/chat.ts` defines typed operation constants and conversation, exchange,
message and reference payloads. Placement belongs to children; appending an exchange creates
three new records without versioning its conversation. A first submission also creates the
conversation. User messages retain the submitted text and timestamp. Agent messages retain
ordered text/tool parts, response status, served model, usage and any failure.

`chat-schema.ts` validates known payload fields and valid JSON, then returns an immutable copy
of the complete original payload. Unknown optional fields and ordinary keys such as `__proto__`
survive at every depth. No accepted content is sanitized or silently dropped. Unknown required
shapes or new kind/status discriminators require deliberate decoding and migration before these
feature readers support their behavior; the generic store remains able to retain their JSON.

`prepareChatSubmission()` returns one immutable `NodeCommit`; the caller retains and commits
that exact request for retries. It requires an existing live user identity and a valid existing
conversation, or creates a conversation atomically with the exchange. Declared reads guard the
author and conversation against changes before acceptance. Identity generation happens during
preparation, so calling preparation again is a new request, not a persistence retry.

`prepareChatResponse()` returns a separate immutable request attributed to the supplied agent
identity. It versions only the agent message, retains its submission timestamp and placement,
and expects the submission version. Completed, failed, stopped and interrupted are terminal
states; running is rejected. The stopped operation has its own kind; the other terminal outcomes
use `completeResponse` with their explicit payload status. Content tools publish independent
transactions so response completion or Stop cannot undo accepted content.

`savedChats()` pages submitted transactions at one viewing cutoff and lists each available
conversation once, newest submission first. `savedMessages()` reads ordered exchanges/messages
at the requested snapshot cutoff and returns their immutable recorded statuses. A historical
running response stays running in this projection. Runtime reads can expose available local ownership;
missing local ownership leaves remote liveness unknown and does not prove abandonment. Reading records never executes tools.

## Observations and provenance

`chat-metadata.ts` owns typed observations, input methods, attachments, Interpretations and exact
reference payloads. Agent owns supplied context, runs and tool execution definitions.
Observations retain source, requested/observed/received instants, monotonic duration, units and collection outcomes.
Disabled, unsupported, denied, unavailable, timed out and failed are distinct outcomes rather
than invented measurements. Run/tool payloads describe execution; these types do not execute it.

`chat-metadata-schema.ts` validates subject/value correlations, dates, units, JSON and UTF-16
selection ranges while retaining complete payloads. `recordChatMetadata()` creates entries and
reference children atomically. Exact structural endpoints are mandatory; interpretations require
an exact evidence link. Late enrichment and corrections create new identities without versioning
the conversation, exchange or original message. The caller supplies stable IDs, author and
exchange from trusted context and retains them for identical retries. Changing the interpretation
creates a correction linked to original evidence, rather than overwriting it.

Browser sensors and collection orchestration are outside this integration. The new Chat producer
accepts only its metadata payloads. Historical `parseMetadata` delegates old run/context/tool
discriminators to Agent schemas, retaining unknown fields and legacy exchange-sibling containment.
`readAgentRun` follows current run children, without inventing legacy relationships or outcomes.
References verify recorded version existence, not the factual support of a claim
or the semantic validity of a selected text range in a particular projection.

## History contract

`app/workflows/history/nodes.ts` exports `nodeHistory()` with the store's cursor/limit/kind filters.
Each entry includes the transaction, author and origin resolved at that transaction's cutoff, and
complete before/after node versions. This exposes content, placement, connection, retargeting and
tombstones without interpreting Git hashes or reconstructing file patches. New actor names do not
rewrite historical attribution. A consumer can request `store.snapshot(transaction.sequence)` to
reconstruct the complete state at any listed transaction.

`prepareContentUndo()` builds an immutable compensating request with caller-supplied retry ID,
author and `undoOf`. It restores previous data/placement/connection or appends a tombstone for
new content. Expected versions reject any intervening affected-node change atomically. Its required
`canUndo` callback is supplied by Product from feature-owned policies. Chat exports
`preservesChatRecords()` to reject changes to its transcript/provenance payloads, checking both
before and after versions, including deletions and retagging. Mixed transactions are refused if
any change fails the composed policy. Product combines `preservesAgentRecords`,
`preservesChatRecords` and content-owned `canUndoContent`. Agent conservatively preserves all
metadata reference nodes. History never imports either producer or hardcodes its record kinds.
This helper is a consumer operation, not a generic permission boundary. The central store's general
`undoNodes` remains available for other policies. Actor authorization and allowed content operations belong
to the runtime's trusted writer context.

## Integrated producer behavior

The Product accepts Chat submission and initial Agent records together before effects. Chat's local
append queue spans preparation/acceptance only; Agent has no whole-Vault execution lock. Module
tools declare reads and own stronger coordination; child reads do not protect absent future children.
Complete retained requests survive uncertain acceptance. Tool invocation acceptance precedes effects,
and outcome acceptance precedes dependent provider continuation. Persistence failures are separate
from execution failures, with saving-only retries. Stop preserves accepted content and drains entered
work. Reopening reconstructs records without replay; absent local ownership leaves liveness unknown.

`productNodeHistory` exposes generic History and composed compensation. Removing a workflow removes
its execution/decoding code, while NodeStore history, differences and snapshots still retain every
accepted generic record. Separate producer/content transactions let content undo preserve transcript
and audit evidence. Migration inside the Vault and remote history growth remain separate work.

Verification uses production memory/GitHub adapters with fictional data: composed Product Chat to
Agent/content/receipts/response/reopen, independent and voice Agent behavior, exact context evidence,
persistence recovery, historical attribution and guarded content undo. Existing adapter suites cover
remote acceptance, cache rebuild/reopen, lost responses and competing devices. No test accesses the
private Vault or paid model endpoint.
