# Chat

Chat is one continuous user-agent dialogue per Vault. The [EAV record contract](data/README.md) owns
its single Conversation, ordered Exchanges and canonical user Messages. Agent owns execution and
responses. `eav-backend.ts` projects them into the dialogue without copying Agent output into a second
Chat record. Topic/date changes, view closure, reload and device navigation do not create new chats.

Production and the default preview use the EAV backend. A one-time importer converts earlier chats
into retained source records with exact provenance. Ordinary readers use the target EAV contract.
There is no New/Open chooser in this path. See [ADR 0011](../../../docs/adr/0011-chat-agent-eav-adoption.md).

`createNodeConversation()` retains the shared interaction lifetime while its name and compatibility
interface await cleanup. It owns drafts, capture association, prompt admission, submissions and recovery
across page/pane views. A continuous backend disables the obsolete selection operations and restores
its authoritative dialogue at startup. Legacy selection behavior exists only for independent callers
still supplying the Node backend. Views cannot bypass owner admission by changing local flags.

`prepareSubmission()` retains text and request identity before clearing its draft source. Enter,
Send and Ask use that policy. Model/tool execution begins only after initial EAV acceptance and the
required compatibility publication. Stop drains entered work. Save retry retains completed results and
never runs a provider or tool again. Recovery obligations remain with the producing writer/runtime;
Chat presents their state and delegates retry. Pending content publication is distinct from execution
receipt recovery.

The backend reads retained contributions separately from constructing effective model context. Each
Agent run captures its initial inputs, and each observable text ModelStep captures the supplied request
context and response metadata. Historical reads do not resume unknown effects. Context budgeting and
compaction are subsequent work.

Focused checks cover domain admission, migration, canonical output, request/response recovery and
production reload. Browser checks cover continuous dialogue, draft/capture lifetime and page/pane layout.
