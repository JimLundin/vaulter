# Pi Durable persisted schema and Vaulter's target format

Researched 2026-10-16 against Pi Durable **1.3.0**, pinned source commit
`71023aec1546d6d677a65669c5665c0927ce0dd0`. Release provenance was established in
[the earlier investigation](pi-durable.md#release-and-evidence). This note compares
the actual record contract with Vaulter's current records. It distinguishes upstream
facts from recommendations; it does not adopt Pi's runtime or implement a migration.

## Findings that change the earlier proposal

Pi stores **conversations, immutable transcript entries, mutable task state,
submissions, and structured documents**. It has no persisted Exchange table and no
separate ModelStep table. Transcript entries are the common record for user messages,
assistant attempts, tool results, system changes and compaction. A task checkpoint
pins an in-flight request; its assistant response becomes a transcript entry. [P1,
P2, P3]

The strongest applicable idea is the separation of **retained records from their
contribution to model context**. A transcript entry can contribute zero, one or more
model messages while carrying its own application data. Raw transcript reduction
and provider-context reduction are separate consumers. This supports an ongoing
dialogue without supplying its entire history to every request. [P1, P2]

Our single ongoing user-agent Conversation is a product decision. Pi supplies a
reserved root Conversation but also supports independent Conversations, history
forks and task-owned Conversations. Its storage schema does not prescribe one
ongoing dialogue per Vault. [P1, P2]

**Assessment:** retain Vaulter's versioned Node/Transaction foundation and specify
the new dialogue/execution record contract above it. Borrow Pi's projection and
boundary rules. Do not describe an Exchange hierarchy, exact source manifests, or
first-class model-step receipts as direct copies of Pi.

## Actual upstream records

### Conversation and ordering

`ConversationRecord` contains `id`, optional `parent: { conversationId, at }`, and
optional `owner: { conversationId, taskId }`. Parent controls inherited history;
owner controls attribution and task-tree operations. Neither title nor dates nor
messages are fields of this record. Root ID is the reserved numeric ID `1`.
Conversation and Entry creation are immutable. [P1]

Pi uses a Session-global numeric identity namespace. Minted IDs increase across
reopen, and entry scans use ID order as creation order. A separate monotonically
increasing `Seq` identifies an atomic storage commit, with gaps permitted. Forks
inherit entries through an inclusive parent cutoff; IDs are not timestamps or
conversation-local turn numbers. [P1, P2]

### Entry envelope and variants

```ts
type EntryRecord = {
  id: EntryId;
  conversationId: ConversationId;
  kind: string;
  model?: readonly Message[];
  data?: JsonValue;
  head?: EntryId;
  edits?: readonly ContextEdit[];
  byTaskId?: TaskId;
};
```

`model` contributes SDK-level messages to provider context; `data` is for views,
extensions and bookkeeping. An entry may carry either, both or neither. `edits`
omit or replace an earlier entry's model contribution without changing that
entry. The newest applicable edit wins. Task attribution is assigned by the
Session. [P1]

| Built-in kind | Persisted contribution | Application data |
| --- | --- | --- |
| `pi.user` | One UserMessage | None by default |
| `pi.assistant` | One AssistantMessage, including failed/aborted attempts | None |
| `pi.system` | One SystemMessage, describing sections/tools in effect | None |
| `pi.tool-result` | One ToolResultMessage | `{ diagnostics }`, including an empty list |
| `pi.reset` | None, or a user-message handoff; `head` points to itself | None |
| `pi.compaction` | One user message containing a wrapped summary; `head` points to the first kept entry | `{ reason }` |

These are the built-in variants in the pinned specification, rather than a closed
storage union: application-defined kinds are supported. [P2, section 8.1]

An entry has no general `running/complete/failed` field. Completed model attempts
carry the AssistantMessage's `stopReason`; live partial output is stored in a
separate `pi.live` document and is converted into an aborted assistant entry when
interrupted. Failed and aborted responses remain stored but are excluded from
subsequent provider requests. [P2, sections 2.1, 8.1, 8.2; P3; P7]

### Model attempts and durable execution

`pi.generation` is a durable task whose checkpoint is a discriminated union:
`prepare`, `request`, `retry`, `poll`, or `tools`. A request checkpoint retains
attempt number, requested model, thinking level, stream options and the newest
included entry (`cutoff`). A tools checkpoint retains the tool-calling assistant
entry and the round's tool task IDs and pending calls. [P3]

Every generation response becomes an assistant entry. Its message retains
content (text, thinking and tool calls), API/provider/model identifiers,
optional served model and response ID, usage, stop reason, error/diagnostics and
available timing/effort metadata. Thus responses and tool-call rounds remain
addressable separately rather than being collapsed into one final answer. [P2,
section 8.1; P6]

There is no standalone immutable request record for each model attempt in the
core schema. The live task checkpoint fixes request parameters and transcript
cutoff for recovery; once the task is completing/terminal its checkpoint is
removed. The terminal task preserves original input, ownership, definition and
outcome, not all earlier checkpoints. The assistant entries remain. **Assessment:**
an immutable Vaulter Model step retaining its exact effective inputs would be
a deliberate stronger audit contract. [P1, `TaskState`/`TaskRecord`; P3]

Generic tasks have `pending`, `running`, `waiting`, `completing`, and `terminal`
states. Terminal outcomes distinguish `completed`, `failed`, `aborted`,
`orphaned` and `faulted`. Task records retain definition version, original input,
conversation and optional task owner, abort information, available timestamps
and live checkpoint. Tasks waiting for child tasks persist their join policy.
This is resumable execution state, beyond Vaulter's current persistence-only
recovery contract. [P1]

### Tool results: three channels, not one output

Pi's tool return contract separates:

- `output`: model-facing text/image content, bounded before transcript storage.
- `structuredOutput`: program-facing JSON, validated against a declared schema.
- `details`: UI data.

Diagnostics and optional usage are additional channels. Declaring these channels
does **not** mean all three are stored in `EntryRecord.data`. [P4]

A model-issued tool call lives inside its assistant entry. Its tool task initially
references `{ kind: "model", assistant, callId }`, then commits validated arguments
and replay policy in an `execute` checkpoint before execution. The final tool-result
entry stores bounded content plus details, usage, error indication and available
timing in its ToolResultMessage; `data` stores structured diagnostics. Diagnostics
are also rendered into a final content block so the model receives them. [P5]

The `model` field is an SDK-level message representation, not a recorded raw HTTP
request. ToolResultMessage can contain session/UI metadata; Pi explicitly marks
nested-call metadata as retained for the record and not sent to the model. Exact
wire payload reproduction is a different requirement. [P6]

Nested tool calls append no transcript entry. Their result for programs is stored
in a task-scoped `pi.tool.nested-call` document owned by the caller, and their task
settles with `{ kind: "nested" }`. Model-issued calls' `structuredOutput` is not
universally retained in the final transcript receipt. [P4, P5; P2, section 8.4]

Pi bounds retained textual output and records dropped-byte/line diagnostics.
Complete raw output is preserved only when the tool/environment explicitly spills
it elsewhere and reports the resulting path; the harness does not itself archive
every discarded byte. **Assessment:** Vaulter must choose its own retained tool
receipt independently from its bounded provider projection. [P2, section 7.3]

### Compaction and source boundaries

The live compaction task pins a summarization request with model/configuration,
attempt, `tail` (newest entry in the captured context) and `firstKept` (first entry
retained verbatim). It reconstructs the immutable source context at `tail` when
summarizing or recovering. Earlier summaries are included when compacting again.
Tool result ordering and cut-candidate rules prevent splitting a call from its
results. A response stopped for length is rejected as an incomplete summary. [P8]

The placed record is only:

```ts
{
  kind: "pi.compaction",
  head: firstKept,
  model: [{ role: "user", content: [{ type: "text", text: wrappedSummary }], timestamp }],
  data: { reason: "manual" | "threshold" | "overflow" },
}
```

Older entries remain stored. Subsequent model context begins with this summary
marker and retained non-marker entries from `head` onward. Manual/background
compactions place summaries through durable write submissions; a blocking
compaction appends directly while generation waits. A queued head targeting before
the already active range is rejected as stale. [P2, sections 2.1, 8.7; P8, P9]

The final compaction entry does **not** retain an exact source manifest or the
captured `tail`. The live checkpoint has those boundaries, but terminal tasks
discard checkpoints. **Assessment:** our working-context summary should be an
Interpretation with exact source-version relationships, captured Snapshot and
explicit covered/retained boundary. This is Vaulter's evidence requirement, not
an existing upstream field. A newer summary must retain its dependency on the
earlier summary and/or its underlying evidence rather than fabricate verbatim
dialogue. [P1, P8; V3]

### Submission admission and documents

Submission is a separate durable lifecycle. It has a stable identity, Conversation,
optional conversation-scoped `requestId`, and type `input` or `write`. Inputs move
from `queued` to `placed` to `done` (with input and answer entry IDs), or to
`unanswered` with reason/detail. Passive writes move from `queued` to `done` when
their entry is appended, or to `unanswered`. Admission therefore does not imply
the input has already entered model context or received a response. [P1]

Documents are typed mutable JSON state with kind/version and optional migration.
Their scope is Session, Conversation or Task. Conversation documents explicitly
choose `latest` or `rewindable` history and fork behavior (`current`, `initial`,
or `asOf` where supported). Logical address is scope/kind/optional family key;
each create-to-retire incarnation has a distinct ID. Storage uses complete bases
and deltas; a checkpoint base bounds replay and is unrelated to transcript
compaction. [P1, P2, section 4]

Examples distinguish responsibilities: `pi.agent` stores selected configuration;
`pi.provider` stores a stable provider session identity; `pi.live` stores active
run/attempt/tool/compaction presentation; `pi.inbox` stores queued work;
`pi.usage` accumulates usage. These are not conversational knowledge records.
[P2, sections 3, 6, 8.2, 8.6; P7]

## Comparison with the current Vaulter format

| Concern | Current Vaulter | Pi Durable | Target implication (assessment) |
| --- | --- | --- | --- |
| Dialogue scope | Titled Conversation with ordered Exchange children | Transcript scope with optional ancestry/ownership | One ongoing native dialogue per Vault; source conversations retain their provenance as sources |
| User contribution | User Message inside Exchange | User/application Entry plus Submission lifecycle | Specify admitted contribution and its placement; keep Exchange if it groups one contribution and its activity |
| Agent response | Agent Message combines text/tool parts and aggregate outcome | Separate assistant entry per model response | Store model responses/steps separately and derive dialogue presentation |
| Run | AgentRun with final output/settings/aggregate usage | Generation task with live phase checkpoint | Keep execution independent of Chat; specify immutable per-step inputs/outcomes without silently adding replay |
| Tool outcome | ToolExecution with JSON input/output; Chat projects tool parts | Tool task plus bounded result entry; separate UI/program channels | Retain canonical tool receipt, bounded model projection and diagnostics distinctly |
| Effective context | ContextInput children under run, exact source reference where available | Entry model contributions + head/edits + pinned request cutoff | Record actual inputs for every step, including summary, recent dialogue and retrieved evidence |
| Compaction | No general working-context compaction record | Summary Entry with head; live task has captured tail | Add source-linked Interpretation and explicit coverage/retention boundary |
| Mutable state | Versioned Nodes and Transactions | Typed documents and document incarnations | Use existing Node history; no second document persistence engine is required |

Current-record claims above follow [V1, V2]. `prepareNodeChatSubmission` presently
reads saved messages for the entire selected Conversation and turns all projected
fragments into initial ContextInputs; these already retain generated content and
exact source versions. The Agent runtime's `finish-step` handling updates the run's
latest response identity, and final completion records aggregate usage/output; it
does not create separate persisted model-step receipts. [V2]

## Contract decisions before implementation

These are recommended decisions for the target proposal, not upstream facts:

1. **One native ongoing dialogue.** Topic/date changes continue it. Imported external
   conversations remain source material with actual speaker/origin attribution;
   their history must not be represented as new exchanges with our agent.
2. **Execution receipts and dialogue presentation have separate ownership.** Agent
   owns runs, model steps, context preparation and tool receipts. Chat owns user
   interaction and dialogue projection. A tool invocation has one canonical receipt.
3. **Retained history is not model context.** Each model step records immutable
   effective inputs, order, transformations, exact source references, configuration
   and available response metadata. Provider SDK messages are adapter output unless
   explicitly selected as a versioned storage protocol.
4. **Compaction creates Interpretation.** Retain original records, exact coverage
   and source versions, captured Snapshot and prior-summary dependencies. Select
   recent complete interactions and preserve protocol-complete tool pairs.
5. **Migration targets one schema.** Migrate existing native chats into ordered
   dialogue contributions while retaining historical Node versions and source
   attribution. Preserve unknown timestamps/order as uncertain rather than invent
   them. Do not retain old selectable-chat affordances or permanent dual readers.
6. **Migration cannot manufacture missing receipts.** Historical runs lacking
   per-step inputs or response metadata retain that absence explicitly; an aggregate
   answer is not evidence of a specific request/tool round. Unfinished effects remain
   uncertain and are never replayed just because the format changed.

## Proposed target record layout

This is a concrete candidate informed by the comparison, not an implemented or
accepted storage protocol. Every record below is a Node; placement, connections,
exact version addresses and atomic Transactions retain ADR 0002's meanings.

```text
Conversation (one ongoing user-agent dialogue per Vault)
  Exchange (one accepted user contribution)
    Message (user contribution)
    Agent run
      Model step
        Context input
          Source reference -> exact source version
        Tool execution
      Model step ...
    Observations / attachments / references

Working-context summary (Interpretation)
  Source references -> exact covered records / prior summary
  Coverage references -> Conversation and first retained Exchange

Retained sources / knowledge
```

| Record | Required target meaning and relationships |
| --- | --- |
| Conversation | A stable identity for the native dialogue, with creation time. Topic titles do not create dialogue scopes. Application selects this identity from authoritative Vault data, rather than a device's last-selected-chat preference. |
| Exchange | One admitted contribution, with stable submission identity and occurrence time. Ordered under Conversation using placement order; wall-clock time does not determine concurrent admission order. It groups the contribution and attributed execution, without defining a provider turn. |
| Message | Recorded speaker, occurrence time and content. The submitted user text is canonical here. An imported message retains its real speaker and source provenance. |
| Agent run | Configuration reference, originating Exchange when applicable, accepted settings/tools, execution status and terminal outcome. Each explicit new execution has a distinct identity; a persistence retry retains the original identity. Independent runs, including summarization, remain possible. |
| Model step | One observable model request and its response or error, ordered under its run. Retain request configuration, ordered effective inputs, content blocks including tool calls, available response identity/model, finish reason and reported usage. Failed/stopped attempts are records, even when excluded from later context. SDK-internal retries remain unknown unless surfaced. |
| Context input | Exact effective content, role, position and transformation for that step. References identify exact contributing Message, Model step, tool projection, summary or evidence versions. This is the accepted application-level input contract; credentials and raw transport headers are excluded. |
| Tool execution | One canonical invocation/outcome linked to its issuing Model step and call identity. Retain validated arguments, execution state, complete structured outcome, bounded model projection and omission diagnostics separately. A reference to omitted content must identify its exact retained evidence. |
| Working-context summary | Interpretation text and method, captured Snapshot, covered prefix, first retained complete Exchange and exact source-version references. Incremental summaries reference the prior summary they consumed. Replacement never rewrites prior dialogue or summary records. |

**Dialogue presentation:** render user Messages and the ordered text/tool activity
of their runs. A completed native Agent run does not also copy its model responses
and tool outcomes into a second Chat-owned message. The run's terminal outcome
identifies whether it answered, stopped, failed or reached a limit; model responses
retain their own finish reasons. Historical source-only answers retain their known
text and provenance without invented Model steps. Rendering retained source records
is part of the target schema, not a reader for an obsolete chat layout.

**Admission:** accept Exchange, user Message and initial run/context together before
execution. Queued input is outside this first target; do not introduce Pi's separate
Submission table without a queue requirement. A new model request must have its
effective inputs fixed and accepted before it executes. Outcome-save retries retain
the same completed response and never send the model request again, consistent with
ADR 0009. Persisting these receipts does not introduce automatic execution resume.

**Context selection:** choose a summary of a covered older prefix, recent complete
Exchanges, relevant retained evidence and the current contribution. Within an active
run, retain complete tool-call/result interactions. A later step references the
accepted bounded projection of each tool result, rather than regenerating a possibly
different projection from today's tool implementation. A stale summary cannot replace
one covering a newer prefix; acceptance checks its captured coverage dependencies.

**Migration:** establish the single Conversation identity, deterministically order
existing native Exchanges and preserve former grouping as source provenance. Convert
old aggregate responses into target retained source records when original model
responses cannot be recovered. Preserve known execution receipts and exact old
versions referenced by evidence. Application readers then use only the target record
contract; historical inspection still resolves immutable prior versions. No new-chat
chooser, obsolete producer variant or permanent dual-reading mode is required.

The proposal changes the glossary's current subject-scoped Conversation definition
and Chat's current ownership of duplicated Agent response payloads. Those changes
should be adopted together with the final record contract. Outstanding implementation
choices include exact discriminators/content-block types, how the Conversation identity
is declared, and how step acceptance fits each text/voice provider adapter. In particular,
a continuously running voice transport may not expose the same request boundary as
the text SDK; the implementation must define an honest observed-step contract rather
than claim unobservable requests were admitted. No glossary or production-schema changes
are made by this research note.

## Sources

All upstream links pin the same inspected commit.

- **P1:** [Core persisted types](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/types.ts#L299): ConversationRecord, EntryRecord, SubmissionRecord, TaskState/TaskRecord, DocumentRecord, Storage contract.
- **P2:** [Authoritative durable specification](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/docs/spec.md): sections 2.1 (context), 4 (documents), 6 (inbox), 7.3 (tools), 8.1–8.7 (built-in records/tasks).
- **P3:** [Generation checkpoints and execution](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/generation.ts#L52).
- **P4:** [ToolExecutionResult and nested-result contract](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/types.ts#L150).
- **P5:** [Tool task and final result persistence](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts#L833).
- **P6:** [Pi AI AssistantMessage and ToolResultMessage](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/ai/src/types.ts#L570).
- **P7:** [LiveState and LiveDoc](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/live.ts#L82).
- **P8:** [Compaction selection, pinned request and placement](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/compaction.ts).
- **P9:** [Inbox head placement and stale-write rejection](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/inbox.ts#L64).
- **V1:** [Agent record payloads](../../app/agent/records.ts), [Chat record payloads](../../app/workflows/chat/records/chat.ts).
- **V2:** [Agent run/context persistence](../../app/agent/store.ts), [Chat submission preparation](../../app/workflows/chat/node-backend.ts), [Agent runtime](../../app/agent/runtime.ts).
- **V3:** [Canonical domain terms](../../GLOSSARY.md), [ADR 0002: versioned Node model](../adr/0002-versioned-node-model.md).

Verification: read pinned first-party TypeScript definitions, task implementations
and specification; compare local record/persistence code. No runtime experiment,
provider integration or migration was exercised. This is a documentation-only
investigation.
