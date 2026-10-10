# Chat production through nodes

Chat owns conversations, exchanges, user and Agent messages, their projections and append ordering.
Agent owns runs, supplied context and tool activity. Both produce into the same Vault collection;
no file translation or migration belongs to this path.

The node-backed backend accepts a stable Send identity, conversation, text and model. Chat prepares
its submission records; Agent independently prepares its run and effective context. Caller
composition combines their changes and read expectations into one same-ID acceptance transaction.
No model or tool executes before all those records are accepted. Keep the complete prepared value
for uncertain acceptance retries rather than preparing new identities or timestamps.

A conversation's append queue covers preparation and initial acceptance, then releases. Unrelated
Agent execution and even the next accepted append can progress while a previous response runs.
An unresolved initial acceptance holds that local append queue until persistence is reconciled;
repeated failed retries cannot release it. This coordinates one NodeStore instance, not a new
cross-device predicate lease. Appending creates the exchange/message/run/context children without
rewriting the conversation or earlier messages. NodeStore retains atomic stale-read conflicts.

Effective context includes caller instructions, accepted prior message projections and the current
user message. Structural reference children retain the exact accepted message versions that
produced each effective input. Restored tool calls/results become model context only and never
execute. Unfinished receipts are described as uncertain. Separate migration work can populate
these same Chat and Agent target payloads.

Agent terminalization is independent of Chat response persistence. Chat reads the accepted durable
tool receipts, projects them with Agent output into its message and versions only that message.
A failed response write retains its full request and is retryable without model/tool execution.
Agent invocation/outcome/terminal persistence states remain visible alongside the response stage.
Stop preserves accepted content and known activity; stopped outcome recovery can finish the
response without a new tool call. A historical Send lookup is read-only by public request semantics;
actual write retries use only the retained complete prepared request and NodeStore digest identity.

The node conversation controller keeps draft, live turns, unread state and view lifetime outside
React. It supports Send, Stop, recovery, reopening accepted conversations and selecting a new chat.
Updated caller dependencies apply to later sends while active runs retain their original backend.
Closing a view does not stop execution; disposal expires execution and prevents late view updates.
Product and preview use this controller with the existing views. Suggestions and dictation update
its shared draft; the superseded file-backed Agent/controller/capture producer has been retired.

## Product composition and caller configuration

The product supplies the session NodeStore, selected OpenAI capabilities and the content module's
`createNode`, `readNode` and `updateNode` tools to node-backed Chat. The tools publish content directly
as `{kind: 'content', title: string, text: string}` nodes with no containment or connection by default.
Updates preserve identity, placement, connections and optional unknown fields, append one version,
and require the version read through the execution context. Transactions use the registered node
create/update operations; Agent supplies the stable Agent author and run origin. Content module
schemas validate titles and text; tools cannot edit producer records. This is one producer layout,
not an importer or a translation of the Vault. The separate migration can populate these records.

Caller configuration supplies user and Agent identities through `OpenProduct.identities`. Defaults
are `vaulter:owner` and `vaulter:agent`, configured for this personal application and unrelated to
GitHub token identity or device identity. Missing records are bootstrapped atomically as actor/Agent
nodes; existing migrated records and Agent configuration remain intact. Deleted or incompatible
configured identities require explicit caller correction. A rejected bootstrap retains the exact
request for retry; concurrent acceptance is reconciled by reading the same valid pair. Configure
preexisting migrated IDs to avoid introducing a second author/Agent identity.

The controller owns draft, subscriptions and live work outside mounted views. Node availability,
identity setup and model configuration gate new Send. Initial save recovery reconciles the retained
request without resuming the recorded execution. The view labels its unknown outcome; another
explicit Send starts distinct work. Invocation, content, tool outcome, Agent completion and Chat
response persistence failures have categorized recovery. Tool-outcome recovery saves the known
result without repeating effects, and Stop keeps pending saving available. Reopening reads accepted
records without executing Agent. Legacy staged files remain intact and require an explicit choice
to send a message while leaving them staged.

The design preview uses these production interfaces with a scripted model and fictional content.
Its versioned sessionStorage journal contains complete accepted NodeCommit requests, replayed in
order through a fresh memory adapter on reload. It never records a rejected request as accepted.
Reset clears this journal and the selected conversation; ordinary reload preserves accepted history.
Query scenarios `initial-save`, `lost-response`, `outcome-save` and `terminal-save` inject one failure
at the corresponding registered operation. Lost-response accepts and journals before throwing.
This tab-scoped fictional retention does not replace the production encrypted cache.

New Chat metadata production accepts observations, attachments and Interpretations with exact
reference children. Historical metadata decoding also delegates old Agent run/context/tool payloads
to Agent schemas, including records previously placed as siblings under an exchange. It retains
optional unknown JSON without rewriting history. Independent Agent readers follow current run-child
relationships; they do not fabricate linkage/outcomes for that older sibling layout. Generic History
can read all recorded versions regardless of producer installation.

## Persisted layout

| Payload | Required content | Placement and connections |
|---|---|---|
| `conversation` | title, createdAt | Root identity; no connection required |
| `exchange` | startedAt | Conversation child; append order chosen by Chat |
| user `message` | role, at, text | Exchange child; optional typed input metadata |
| Agent `message` | role, at, status, parts | Exchange child; optional model, tokens and error |
| `reference` | topic/place role | Endpoints in connection, independent of placement |
| `observation` | subject, source, time, outcome | Metadata child of exchange |
| `attachment` | name, mediaType, bytes, sha256 | Metadata child; optional embedded metadata/dimensions |
| `interpretation` | category, at, statement, certainty, method | New metadata identity with required exact evidence link |
| `metadataReference` | role | Metadata child; source exact metadata version and target exact evidence version |

Chat owns `chat.submit`, `completeResponse`, `stopResponse`, `checkpointResponse` and `recordMetadata`.
Initial composed submission is attributed to the user and originates from its exchange. Response
transactions are attributed to the configured Agent and originate from that same exchange. Metadata
transactions retain their caller-supplied author and exchange origin. Agent content/tool transactions
instead originate from the Agent run. All identities and source references remain in immutable history.
