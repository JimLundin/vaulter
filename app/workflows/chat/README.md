# Chat

Chat is one continuous user-agent dialogue per Vault. The [EAV record contract](data/README.md) owns
its single Conversation, ordered Exchanges and canonical submitted Messages. Agent owns execution,
responses and tool outcomes. Agent reading interprets its recorded and live activity; the backend projects that activity into the dialogue. Topic/date changes,
view closure, reload and device navigation continue the same Conversation.

`createConversation()` owns drafts, capture association, prompt admission, submissions and
recovery across page/pane views. `prepareSubmission()` retains text and request identity before clearing
the draft. Enter, Send and Ask use the same policy. Agent execution begins after initial acceptance;
Stop drains entered work. Recovery delegates to the producing owner and retries exact publications
without executing a model or tool again.

RetainedSource contributions preserve imported material with its known provenance and date precision,
without inventing unavailable execution records. Native Agent output is projected directly. Historical
reading never resumes effects. Explicit ContextCheckpoints summarize accepted dialogue prefixes;
subsequent runs use an applicable checkpoint, later Exchanges and current instructions while retaining
exactly supplied ContextInputs. Automatic checkpoint scheduling and context budgets remain future work.

`eavChatFactory()` binds the native database used by production and fictional previews. Focused checks cover admission,
canonical output, recovery and reload; browser checks cover continuous dialogue, draft/capture lifetime
and page/pane layout. See [ADR 0011](../../../docs/adr/0011-chat-agent-eav-adoption.md).

`reload()` reads the one Conversation while preserving the draft and rechecking task admission before
applying results. `restore()` is lower-priority startup reading and cannot replace explicitly admitted
work. There is no selectable-chat mode, saved-chat pagination, or New conversation action.
