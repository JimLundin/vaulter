# One ongoing dialogue per Vault

Open `chatSchema` once with the typed EAV engine. Domain callers use entity objects with hidden
identity; a Conversation is resolved from authoritative Vault data, never from a device selection
or a subject title. `conversation(tx)` returns that identity and creates it atomically on first use.

| Owner | Record | Meaning |
|---|---|---|
| Chat | Conversation | The single ongoing native dialogue |
| Chat | Exchange | An ordered contribution; submission key deduplicates admission |
| Chat | Message | Canonical user words, author and occurrence time |
| Chat | RetainedSource | Historical content and exact source provenance; no manufactured execution |
| Chat | ContextCheckpoint | Attributed summary and exact coverage of a dialogue prefix |
| Chat | RunContext | Checkpoint and subsequent Exchanges supplied to a run |
| Chat | InputSource | Message identity associated with captured effective input |
| Agent | Agent / Actor | Editable configuration and attribution |
| Agent | AgentRun | Accepted configuration, initial inputs and terminal execution outcome |
| Agent | ModelStep | One observable request's effective input, configuration and response |
| Agent | RunTool / ToolExecution | Accepted capability and one canonical invocation/outcome |

```ts
await using db = await openDatabase({ schema: chatSchema, storage });
const accepted = await db.transaction({ author: user }, (tx) =>
  submitChat(tx, { submission: requestKey, author: user, agent, text: 'Where next?', at: new Date() }),
);
const exchange = await db.transaction((tx) => readExchange(tx, accepted.exchange));
```

A topic/date change adds another Exchange to the same Conversation. Admission accepts the Message,
Agent run, initial effective inputs and capability snapshot atomically. There is no Chat-owned
response placeholder, copied tool outcome or response-finalization write. Reading an Exchange
resolves Agent records to render text and tool activity in recorded response order. Agent runs also
work independently of Chat. A submission key is transport deduplication, not entity identity or a queue.

The text runtime accepts each model request before calling its provider and retains each response
before another step. Its input format explicitly versions the AI SDK's application-message protocol;
credentials and transport headers are excluded. Tool receipts reference the issuing ModelStep.
SDK-internal retries are not separately observable. Opaque external execution adapters retain their
known run-level inputs/output and do not manufacture ModelSteps. Failed/stopped work remains recorded.
Save retry is persistence-only, including request/response saves; it never resumes a model or tool.

RetainedSource records preserve source text, known attribution and honest occurrence precision.
Unavailable per-step details remain absent. Deterministic source ordering is presentation order rather
than a claim of precise chronology. Application startup performs no conversion or compatibility decoding of retired data models. All producers and readers use the native EAV contract.

Use a transaction or `db.at(commit)` for consistent multi-query reads. Retained history and effective
model context are separate records. Explicit context checkpoints summarize a recorded prefix and supply future runs with summary plus
subsequent activity. Changed source evidence invalidates their use. Automatic context budgeting and
bounded tool projections remain subsequent work; this change does not implement a durable execution scheduler or automatic resume.

The product and default preview reopen the same dialogue and expose no New/Open conversation chooser.

Checks: `npm run test:fast -- app/modules/conversation/data app/modules/conversation/eav-backend.test.ts`.

The Timeline sidebar navigates Exchanges and saved context checkpoints. Creating a checkpoint runs
a separate tool-free Agent; browsing and jumping do not alter drafts, execution or context selection.
