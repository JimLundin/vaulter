# Node consumer contracts

The consumer contracts introduced in [PR #34](https://github.com/JimLundin/vaulter/pull/34) and
central persistence from [PR #21](https://github.com/JimLundin/vaulter/pull/21) are integrated into
`structure`. They define feature records, ingress schemas and storage operations over the
central `NodeStore`. Feature payloads, schemas and operations live with their owning workflows:
`workflows/chat/records/` and `workflows/history/nodes.ts`. Storage knows generic JSON, versions,
transactions, placement and connections; it does not know Chat or History semantics. Product,
the existing Chat controller, History screens, browser collectors and agent providers are not
wired to these operations yet. Runtime integration remains part of
[issue #19](https://github.com/JimLundin/vaulter/issues/19); these contracts do not complete that issue.

```text
NodeStore (#21, integrated into structure)
  └─ consumer contracts (#34, integrated into structure)
       ├─ Chat: conversation → exchange → user/agent messages
       ├─ observations, supplied context, agent runs, tools, interpretations and exact references
       └─ History: attributed transactions, complete differences and guarded content compensation
            └─ agent execution and Product/History integration (following PR)
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
running response stays running in this projection: determining that its live owner is gone and
presenting interruption belongs to the runtime. Reading records never executes tools.

## Observations and provenance

`chat-metadata.ts` defines typed observations, input methods and attachments, supplied context,
agent runs, tool executions, interpretations and exact reference payloads. Observations retain
source, requested/observed/received instants, monotonic duration, units and collection outcomes.
Disabled, unsupported, denied, unavailable, timed out and failed are distinct outcomes rather
than invented measurements. Run/tool payloads describe execution; these types do not execute it.

`chat-metadata-schema.ts` validates subject/value correlations, dates, units, JSON and UTF-16
selection ranges while retaining complete payloads. `recordChatMetadata()` creates entries and
reference children atomically. Exact structural endpoints are mandatory; interpretations require
an exact evidence link. Late enrichment and corrections create new identities without versioning
the conversation, exchange or original message. The caller supplies stable IDs, author and
exchange from trusted context and retains them for identical retries. Changing the interpretation
creates a correction linked to original evidence, rather than overwriting it.

Browser sensors, collection settings, network adapters and collection orchestration are deferred
to the agent PR. References verify recorded version existence, not the factual support of a claim
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
any change fails the composed policy. History never imports Chat or hardcodes its record kinds.
This helper is a consumer operation, not a generic permission boundary. The central store's general
`undoNodes` remains available for other policies. Actor authorization and allowed content operations belong
to the runtime's trusted writer context.

## Runtime integration requirements

Agent runtime integration must accept Send before invoking any model or tools, serialize conversation
appends, coordinate reviewed staging and scope tool ownership without holding a database
transaction across streaming. Child-list reads do not protect the absence of a future child;
the preparation helper alone is not a cross-device conversation lease or append-order lock.

The runtime must retain complete submission and terminal requests through uncertain acceptance,
surface terminal save failures separately from model failures, and retry persistence without
executing the model again. It must restore transcript/model context, identify running responses
without owners as interrupted, expire tools on Stop and preserve already accepted content.
Product must wire node synchronization/error status and History pagination/differences/undo,
including feature-owned undo policies. Removing a workflow removes its schemas and operations;
persisted node versions and generic History reads remain available through storage.
Vault-file migration, private-account validation and remote history growth remain separate work.

Verification uses the production memory adapter and fictional records. Tests cover local write
sizes, stable retry identity, stale declared reads, immutable historical projections, pagination,
payload retention, exact metadata references, historical attribution, deletion/restore, mixed
audit protection and conflicts in compensating content undo. Persistence adapters are covered by
the preceding PR. No test calls a model, sensor or private vault.
