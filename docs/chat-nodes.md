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
cross-device predicate lease. This backend concurrency is not UI Send permission: the retained Chat
interaction blocks another submission while execution is busy or recovery remains unresolved.
Appending creates the exchange/message/run/context children without
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

## Retained Chat interaction

`createNodeConversation()` is the primary interaction consumed by Product, Chat page/pane and the
conversation chooser. Its snapshot includes shared draft, turns, submission/review, prompts,
selection/records, action availability with reasons, capture and recovery. Availability informs the
presentation; every action rechecks admission. There is no raw Chat Send/handoff API that bypasses
preparation. Independent `NodeChatBackend.send(NodeChatRequest)` remains the durable writer seam.

`prepareSubmission()` captures the current draft source revision by default, or accepts supplied
text/source intent. It returns `blocked`, `review`, or `owned` with a stable request and completion.
Chat retains submitted text/identity before clearing its source; local ownership precedes durable
initial acceptance. Preparation failure/blocking preserves input, and older work cannot clear a
newer draft revision. Keyboard Send, button Send, Ask and review confirmation follow this policy.

Review retains text and immutable staged-file evidence across view changes. Cancel preserves the
current draft. `confirmReview()` rechecks permission and current staging: changed evidence refreshes
review and requires another confirmation. It sends the retained text, preserving later draft edits,
and leaves legacy file staging intact.

`open()`, `restore()` and `newChat()` return selected/blocked/failed/superseded outcomes. New/Open
share capture, busy-run and recovery restrictions across chooser, commands and routes. Ineligible
intent leaves the current task intact. The latest eligible explicit selection wins overlapping reads;
New, submission and destruction invalidate old reads. Startup restoration has lower priority.
Open preserves the draft; New clears it after admission and creates no empty persisted conversation.
Selection pending/errors are shared task state. Product reconciles failed/blocked routes with the
actual selected identity; the chooser dismisses after a selected outcome. `watchRecords()` retains
shared subscribed list reading while a chooser is visible; snapshots expose loading/error/results.
Saved reading requires no configured model and never replays unfinished Agent/tool work.

`receivePrompt()` claims each application prompt once across simultaneous/reopened views. Eligible
Ask uses preparation; busy/unavailable submission may fill an editable draft without scheduling a
later send. Capture/review conflicts retain supplied text and reason without replacing input.
`applyPrompt()` and `dismissPrompt()` are explicit user actions; use rechecks current admission and
changed-conversation association rather than executing a stale prompt automatically. Suggestions
are optional non-executing text, consumed through the same draft-use policy.

Transcription independently owns recording sessions, provider connection, permission, output revision
ordering and release. Chat borrows that capability and associates its admitted session with the
starting conversation/draft revision and prefix. It interprets valid output against that association:
corrected final words replace only the partial suffix. Manual typing first invalidates association
and publishes newer input, then requests scoped cancellation. Errors/interruption keep applied words;
late output cannot mutate superseded drafts. Capture action means Cancel while connecting, Finish
while listening and Wait while finishing. Finish produces text without sending it.

`recovery` distinguishes save, content publication and accepted-record refresh, including owner
labels, errors, allowed actions and coalesced progress. Views consume these values and delegate
`retrySave()`, `retryContentSave()` or `refreshContext()`; saving one obligation does not conceal
another. A reply completed while all views are hidden remains unread through failed final reads and
response-save retry. An open view's `viewing()` acknowledgement clears it once; later refresh/retry
cannot mark the same reply unread again.

Draft, review, prompts, selection and accepted run survive ordinary view closure within the owning
application session. Focus and chooser disclosure remain presentation state. Unsubmitted task state
is not newly persisted across reload. Product supplies a stable Vault session scope, NodeStore,
identities and capabilities. Same-session readiness/configuration changes apply to later work while
an active request keeps its admitted backend/context and a recording keeps its original provider.
Session replacement and React effect replay create fresh owners, not revived disposed instances.

Construction acquires no recording subscription until the owner is used/committed. Chat owns its
backends/subscriptions and only recording it admitted; replacing borrowed Transcription releases
that associated session without disposing the supplied module or cancelling unrelated capture.
`dispose()` is terminal/idempotent, expires local execution and associations and suppresses late
state/route callbacks. Transcription has its own terminal/idempotent disposal. Already-entered
acceptance and domain effects retain their independent ownership; shutdown starts no new Chat
response/terminal/recovery work. Sign-out/session hooks release both owners. View/list release is
idempotent and does not destroy retained Chat work.

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

Chat owns conversational admission outside mounted views. Supplied node availability,
identity setup and model configuration gate new Send. Initial save recovery reconciles the retained
request without resuming the recorded execution. The view labels its unknown outcome; another
explicit Send starts distinct work. Invocation, content, tool outcome, Agent completion and Chat
response persistence failures have categorized recovery. Tool-outcome recovery saves the known
result without repeating effects, and Stop keeps pending saving available. Reopening reads accepted
records without executing Agent. For an unfinished Chat response, Chat also projects accepted tool
receipts and output from the Agent run accepted with that response. The actual Chat response status
remains running; later context cites each exact receipt/run version without claiming the missing
response was saved or replaying unfinished tools.

Content acceptance failures retain the original attributed request separately from response saving.
“Retry content save” resubmits that request only and acknowledges accepted content separately; the
failed tool receipt is never rewritten as success. “Refresh records” reads current nodes without
executing effects or reviving expired tool access. Unresolved diagnostics remain visible and block
another Send. Legacy staged files remain intact and require an explicit choice
to send a message while leaving them staged.

The design preview uses these production interfaces with a scripted model and fictional content.
Its versioned sessionStorage journal contains complete accepted NodeCommit requests, replayed in
order through a fresh memory adapter on reload. It never records a rejected request as accepted.
Reset clears this journal and the selected conversation; ordinary reload preserves accepted history.
Query scenarios `initial-save`, `lost-response`, `content-save`, `content-lost-response`, `outcome-save`
and `terminal-save` inject one failure
at the corresponding registered operation. Lost-response accepts and journals before throwing.
This tab-scoped fictional retention does not replace the production plaintext cache.

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
