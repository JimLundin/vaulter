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
The existing file-backed controller remains usable for app compatibility until the next app/preview
integration ticket switches visible flows and preserves established suggestions and dictation.
