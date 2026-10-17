# Agent-owned execution

Agent owns typed EAV configuration, runs, effective ContextInputs, observable ModelSteps and canonical
ToolExecutions in [data/schema.ts](data/schema.ts). Text and independent live voice use these same
records. Runs can exist without Chat; Chat projects accepted activity without copying agent messages
or tool outcomes. Application supplies models, tools and trusted Actor/origin context.

Initial run configuration and effective inputs are accepted before provider execution. Observable
model requests retain their actual input format and configuration; responses and failures are saved
before subsequent execution. Provider-internal attempts remain unknown. Voice retains supplied context,
finalized speech, available request/response metadata and tool declarations without fabricating an
opaque provider's internal model steps. Credentials never enter retained execution records.

Tool execution accepts its invocation before the effect and records its observed outcome afterward.
Side effects have their owner's acceptance boundary. Stop prevents further execution and preserves
accepted effects and receipts. Failed or uncertain persistence retains the exact publication for retry;
recovery does not rerun a provider or tool. Reading recorded activity or reopening storage never resumes
execution. A reader without a local controller cannot infer abandonment from a running status.

Agent runtime owns ordering, completion, disposal and persistence recovery. Tools cannot override
trusted attribution. ContextInputs retain exactly supplied information independently of later edits to
source records. Historical EAV evidence references preserve accepted source snapshots.

See the [data model](../../docs/data-model.md) and [Chat contract](../workflows/chat/README.md).
Focused runtime checks exercise admission, outcomes, Stop, failed saves and effect-free recovery.

`reading.ts` interprets accepted Agent activity for transcript and timeline callers. It decodes the
current Model step format, orders text and Tool execution receipts, and reconciles opaque external
output without executing providers or retrying publications. Live receipt projection also stays with
Agent. Chat orders Exchanges and owns Conversation meaning; it does not parse model response formats.
