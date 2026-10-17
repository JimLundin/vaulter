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

`migration.ts` converts the prior Node chat layout once into RetainedSource records within the
single dialogue. Original grouping, text, known speaker/status, occurrence metadata and exact Node
versions remain provenance. Unrecoverable per-step details stay absent. Source ordering is a
deterministic presentation order, not a claim of precise chronology for ties or unknown dates.
Normal Chat reads then use only EAV. Existing exact Node evidence remains resolvable for other modules.
Immutable compatibility excerpts still let unmigrated content tools cite new contributions.

Use a transaction or `db.at(commit)` for consistent multi-query reads. Retained history and effective
model context are separate records. Context budgeting, bounded tool projections and compaction are
subsequent Agent work; this change does not implement a durable execution scheduler or automatic resume.

The product and default preview reopen the same dialogue and expose no New/Open conversation chooser.
The old Node backend remains as a compatibility test seam for unmigrated independent callers.

Checks: `npm run test:fast -- app/workflows/chat/data app/workflows/chat/eav-backend.test.ts`.
