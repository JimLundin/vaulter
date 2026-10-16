# Chat and Agent EAV model

Open `chatSchema` once with the Vault EAV engine. `agentSchema` can also be opened independently for
applications that only need Agent execution. Chat references Agent's records; Agent has no Chat dependency.

| Owner | Entity | Meaning |
|---|---|---|
| Shared | Actor | User, agent or system attribution |
| Agent | Agent | Editable provider, model, instructions, settings and tools |
| Agent | AgentRun | Effective configuration, lifecycle, output, usage and errors |
| Agent | RunTool | Tool name/version accepted for this run |
| Agent | ContextInput | Ordered effective provider input |
| Agent | ToolExecution | One accepted invocation and its outcome |
| Chat | Conversation | Named context of exchanges |
| Chat | Exchange | Ordered dialogue or source-material grouping |
| Chat | Message | Ordered user, agent or record contribution |
| Chat | TextPart / ToolPart | Interleaved text and references to execution receipts |
| Chat | InputSource | Message identity associated with captured effective input |

`InputSource` is an identity association, not a pinned historical reference. The input itself stores
the actual supplied content. The initial live migration retains exact evidence for Node-based tools
through immutable compatibility excerpts; new compatibility excerpts can stop being produced once those consumers migrate; existing evidence remains retained.

```ts
import { openDatabase } from '../../../vault/eav/index.ts';
import { chatSchema } from './schema.ts';
import { submitChat, readExchange } from './operations.ts';

await using db = await openDatabase({ schema: chatSchema, storage });
const submission = await db.transaction({ author: user, origin: conversation }, (tx) =>
  submitChat(tx, { conversation, author: user, agent, text: 'Where next?', at: new Date() }),
);
const exchange = await db.transaction((tx) => readExchange(tx, submission.exchange));
const latest = await db.entities.messages.first({
  where: { exchange: { eq: submission.exchange } },
  orderBy: [{ position: 'desc' }],
  select: { role: true, run: { status: true, requestedModel: true } },
});
```

The transaction contains the user message, response placeholder, run, accepted tools and inputs.
Configuration instructions precede supplied context and the new user input. Domain operations do
not execute providers. `startAgentRun` supports standalone runs. `startToolExecution` validates tool
membership and serial invocation order; `finishToolExecution` records a terminal outcome once.
`finishAgentRun` refuses to finish with pending tools. `recordResponse` accepts only that response's
own terminal receipts and preserves text/tool interleaving. `recordSummary` does not invent a speaker.

Pass a transaction or `db.at(commit)` to multi-query readers for one consistent snapshot. Returned
objects carry hidden identity through projections/spread. Use `get(object, { select })` for an
individual entity and `first` for a filtered search. Sets do not encode order; exchanges, messages,
inputs, executions and parts have explicit positions.

The live backend is `../eav-backend.ts`; it uses Agent's `eav/runtime.ts`, which gates provider/tool
execution on acceptance and retains initial, invocation, outcome, terminal, response and compatibility
save recovery. Stopping drains entered work. Saving a recovered invocation never invokes its tool.
Opening a saved running message retains its unknown outcome and never starts execution.

The application currently composes EAV storage for production Chat, while other producers and
historical readers continue using Nodes. Historical data is read in place rather than bulk imported.
`ConversationRoute` and `Submission` are integration records for the existing shell and retry
protocol; their strings are not the identities used by domain operations.

Focused checks: `npm run test:fast -- app/workflows/chat/data app/workflows/chat/eav-backend.test.ts`.
The compile-only contract checks projections, JSON and reference types. Production verification
includes sending, GitHub persistence and reload without Agent execution.
