# Ideas to borrow from Pi Durable for Vaulter's Agent

Research snapshot: **2026-10-16**. Package: **`@earendil-works/pi-durable` 1.3.0**, not Pi's CLI or a generic durable-workflow library. Investigated published npm files and the release's source and normative specification; no dependencies or runtime code changed.

## Direction

**Use Pi Durable as a reference implementation for improving our own Agent.** Package adoption is secondary. The question is which implementation ideas improve Vaulter's current browser agent, without replacing its Node model, publication rules or provider interfaces.

The strongest opportunities are bounded model-facing tool results, context budgeting and compaction, and observable model-step outcomes. Explicit execution phases can support those features as they become necessary. Queued input, safe resumption and subagents are later candidates tied to concrete product needs. The following proposals come from source review; they are not implemented or experimentally validated.

## Transferable implementation ideas

### 1. Bound what the model receives from tools

**Borrow first.** Pi separates model-facing `output`, program-facing `structuredOutput`, and UI `details`. Its tool pipeline applies byte/line limits, supports retaining the head or tail, and adds explicit truncation diagnostics. See `boundContent()`, result finalization and `structuredOutputError()` in [tool.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts) and [truncate.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/truncate.ts). We should borrow the separation and honest truncation, rather than copy their default limits.

Vaulter's [durableTools](../../app/agent/tool-execution.ts) records and returns the same full JSON result, and [historyModelMessages](../../app/agent/history.ts) supplies that full JSON on later runs. [Discovery](../../app/agent/discovery.ts) caps results at 20 sources and 20 knowledge items, but each item includes its complete text. [Content reads](../../app/vault/content/tools.ts) also return full content. A large passage can therefore consume disproportionate context during the current run and every later run.

**Adaptation:** retain the truthful tool receipt in the Vault, but supply a bounded, valid provider projection. Keep node/transaction identities intact; never truncate serialized JSON into invalid JSON. Owning tools should offer paging or exact-version passage reads when omitted content matters. Central Agent projection should supply a size ceiling and truncation metadata, with tool-specific shaping supplied explicitly by Application. Record what the model actually saw; retain exact evidence and text selections when a shortened passage is used for grounding. Apply the same projection to live continuation and historical context, and account for the voice tool path.

**Benefit:** large search/read results stop crowding out the user's request and recent reasoning. **Acceptance:** a fake tool returning a large Unicode passage produces a bounded model input with intact identities and an explicit omission marker, while its recorded outcome retains the complete result. A later run sees the same bounded representation and a follow-up passage read retrieves the omitted evidence. Content publication receipts remain truthful.

### 2. Budget context and compact at complete interaction boundaries

**Borrow next.** Pi's [compaction.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/compaction.ts) contains several useful details: `estimateContext()` uses recent measured usage plus estimates of newly appended messages; `selectCut()` and `isCandidate()` avoid splitting a tool call from its result; `summaryText()` rejects empty, incomplete, or tool-calling summaries. [generation.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/generation.ts) has proactive thresholds and a separate overflow-compaction path instead of retrying the unchanged oversized request.

Vaulter's [prepareNodeChatSubmission](../../app/workflows/chat/node-backend.ts) projects all saved conversation messages into each new run. Its context records already support `summary`, `selection` and `truncation`, but this path has no general context budget or compaction policy. Existing retained summaries are source material; they are not a compaction of the agent's working context. [V1, V4]

**Adaptation:** introduce a model-context preparation seam that returns effective inputs, transformations, source references and budget diagnostics before the run's initial acceptance. Include instructions, tool schemas and reserved output capacity in the request budget, not just conversation text. Chat supplies conversation history; Agent owns execution-context policy. Start with a configurable budget and a foreground compaction of an older prefix, retaining recent complete exchanges. A compaction is an attributed Interpretation with exact source references, not a rewritten conversation or a Wiki page. The next run records the actual summary and recent inputs supplied. Later, background summarization can capture a snapshot and first-kept boundary, then reject stale placement rather than overwrite a newer summary. Provider context-window metadata and token estimates require explicit configuration/verification; previous usage is useful only when it describes the context being estimated.

**Benefit:** long conversations remain usable, with a readable explanation of what was summarized. **Acceptance:** a constrained fake provider receives summary plus recent complete interactions under the configured budget; original messages and exact links remain available after reload. A summary ending at a token limit is rejected, tool pairs remain complete, and a summary of an old snapshot cannot replace a newer compaction. No unchanged overflow request loops indefinitely.

### 3. Expose model steps, limits and retry diagnostics

**Borrow alongside context work.** Pi's generation checkpoint distinguishes `prepare`, `request`, `retry`, `poll` and `tools`. It retains retry attempt, error and next retry time, and [usage.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/usage.ts) counts reported usage when recording responses, including failed or aborted attempts. Overflow is classified separately from transient model errors. [generation.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/generation.ts)

Vaulter already has a step limit, retry settings and final aggregate token usage. However, [runtime.ts](../../app/agent/runtime.ts) records only the latest response identity at `finish-step`, final totals at `finish`, and maps execution errors to the broad `executionFailed` code. The external provider interface exposes progress and a terminal result, with less usage detail. SDK retries already exist; adding another independent retry loop would risk duplicate retries.

**Adaptation:** first retain model-step response metadata, finish reason, reported usage and whether execution reached its configured step/output limit. Extend live state with structured diagnostics for model versus persistence failure. Expose provider retry information where supported; do not invent visibility into SDK-internal attempts. Add retry classification or scheduling only if the existing provider seam cannot supply the required behavior. Failed attempts count only when usage is actually available; missing usage remains unknown. Cost estimates must retain pricing provenance as the existing record schema requires.

**Benefit:** users can distinguish a completed answer from a run that exhausted its steps, and understand delays and spend. **Acceptance:** a fake two-step run that ends at its limit retains both available response identities and usage, reports the limit, and invokes each tool once. A failed attempt with reported usage is counted once; missing usage is not reported as zero spend. Stop prevents a pending retry from issuing another request.

### 4. Make execution phases explicit when adding behavior

Pi's typed phase checkpoints and separate `GenerationTask`/`ToolTask` handlers make permitted transitions visible. Tool admission validates effective arguments, commits intent, executes, then finalizes the result. [generation.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/generation.ts), [tool.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts)

Vaulter already has the important intent/effect/outcome gates. Its runtime coordinates execution, content saves, terminal saves and live state using several closure variables and optional handles. **Adaptation:** as context preparation or retry diagnostics add transitions, group the state and operations for each phase behind a small internal interface. Keep execution control separate from finalized persistence obligations; multiple pending obligations can coexist. No generic task engine, scheduler or persisted checkpoint format is needed just to improve this seam.

**Benefit:** future changes become easier to assess without weakening recovery. **Acceptance:** existing tests for Stop, concurrent independent runs and recovery remain the behavioral contract; add only transition tests protecting new behavior. In particular, retrying an outcome still releases the same live tool promise, and retrying an invocation that never executed still does not start the tool. [V1, V2, V3]

### 5. Distinguish queued follow-ups from steering an active run

Pi's [inbox.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/inbox.ts) applies steering at post-tool boundaries and follow-ups at final boundaries. Queued items are admitted separately from their eventual placement and have stable submission identities.

Vaulter's Chat backend already serializes submissions per conversation, but [NodeConversation](../../app/workflows/chat/node-conversation.ts) currently blocks ordinary Send while busy. **Adaptation if wanted:** begin with an explicit queued follow-up that the user can inspect or withdraw. Persist its admission before acknowledging it; prepare the next run's context only when it starts. Steering needs a separate execution boundary and retained effective context, because editing an already-finalized initial request would break our guarantees. Do not reinterpret today's Send automatically as steering.

**Benefit:** users can leave the next instruction while a run finishes. **Acceptance:** a queued follow-up survives reload without starting a second concurrent run; withdrawal prevents execution; duplicate admission finds the same item. A later steering feature changes only the next model step and never interrupts an entered publication or mutates accepted context. Priority is below output/context work unless this interaction becomes a product requirement.

### 6. Gate future resumption by capability, not missing liveness

Pi commits replay policy with tool intent and requires both stored and current policy to be safe before rerunning an interrupted tool. Nested tasks use stable keys to reattach to prior work. This is a useful design constraint if Vaulter later adds explicit resume or delegated runs. [P6, P7]

Vaulter already reports missing outcomes as uncertain and supplies an uncertainty warning in provider history; missing local ownership never proves abandonment. **Adaptation:** preserve that behavior. A future explicit resume capability needs a recorded model-step boundary, tool-specific read/reconciliation/idempotency policy, and execution ownership. Neither a historical read nor a persistence retry should trigger it. Safe replay metadata alone cannot make a content tool generating fresh identities replay-safe. Persistent subagent ownership and cancellation are worth studying only when a concrete delegated workflow needs them. [V1, V2, V3]

**Acceptance:** an unfinished publishing tool is never rerun on read; explicit resumption reconciles its accepted Transaction before continuing. A changed capability cannot broaden a previously accepted invocation's replay rights. No runtime replay is proposed as part of this investigation.

### 7. Coalesce streamed presentation if measurements justify it

Pi's `streamResponse()` in [generation.ts](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/generation.ts) throttles partial publication and drains it before classifying the final response. Vaulter currently notifies listeners on every text delta. **Adaptation:** if a rapid stream produces excessive rendering, coalesce in-memory presentation updates and flush the exact final text before terminal state. This does not require persisting every partial to GitHub. **Acceptance:** thousands of tiny deltas produce bounded listener updates and identical final text; Finish and Stop leave no delayed partial that can overwrite terminal state. Treat this as a measured optimization rather than a demonstrated performance defect.

## Suggested order

Start with bounded tool projections and context-budget diagnostics, then add compaction and clearer model-step outcomes. Use explicit phase structure where those changes need it. Investigate queued input, resume or subagents when their user-facing need is established. Borrow algorithms and boundary rules into the existing Agent/Chat modules; retain the source links for implementation review.

The remainder records upstream semantics and package-integration constraints as background evidence. It does not recommend adopting the package or creating an external worker.

## Release and evidence

The npm registry reported 1.3.0 as latest, published **2026-10-15T19:13:35.556Z**. Its provenance attestation links the artifact to tag `v1.3.0`, commit **`71023aec1546d6d677a65669c5665c0927ce0dd0`**, and the first-party build workflow. The README in the npm tarball matched that commit's README by SHA-256. Source links below pin this commit rather than `main`. [P1, P2]

The package says **“Experimental. The API changes without notice between releases.”** Its license is MIT; its declared Node engine is `>=22.19.0`. The npm package first appeared on 2026-09-19 and reached 1.0.0 on 2026-10-01. Even 1.1.0 and 1.2.0 include breaking changes, including the custom storage contract and fatal storage-error behavior. **Assessment:** the major version is not evidence of a stable integration contract yet. These dates describe this package's publication history, not the age of Pi as a whole. [P1, P4, P5]

## What it provides

Pi Durable is a persistent agent harness built on `pi-ai` for models and Chord for typed JSON document state. A session serializes atomic commits containing transcript entries, document changes, submissions and task checkpoints. A built-in generation task owns tool tasks and subsequent model turns. Published state is committed before observers see it. [P3, P6]

| Capability | Release behavior | Value for Vaulter: assessment |
| --- | --- | --- |
| Restart recovery | Reopen storage and start scheduling with `resume()`, submission or wait. Pending work continues from durable checkpoints. | A real addition to our current read-only reopening of accepted runs. |
| Input deduplication | Conversation-scoped `requestId` finds the existing submission after restart. | Useful for remote job admission, but not sufficient to deduplicate external writes. |
| Subagents | Task-owned conversations; foreground and background examples, persistent messages and answer reporters. | Useful if delegated research or wiki work becomes a product feature. |
| Task orchestration | Child ownership, persisted waits, `allSettled`/`failFast`, abort cascades and a live task graph. | Saves substantial orchestration work for multi-step jobs. |
| Compaction | Manual, threshold/background and overflow-triggered summaries; older entries stay in storage. | Useful for long conversations; retained source links still need Vaulter's provenance model. |
| Live observation | Structural watches and derived events; late joins get snapshots, slow consumers are bounded. | Suitable for a browser observing an external worker. |
| Tools/extensions | Named registry, TypeBox argument validation, hooks, nested tools, deferred tool search and optional code mode. | Adaptable, but our module capabilities and trusted attribution still need an integration layer. |

These capabilities and their qualifications are documented in the release README and specification. Background work survives a parent's abort; an explicit background abort can include it. This is ownership within one harness, not a guarantee that tasks execute without a running host. [P3, P6]

## Crash recovery is not exactly-once execution

**Unsafe tools are not blindly replayed.** The default tool replay policy is `unsafe`. Intent, effective arguments and replay policy are committed before execution. After a crash, a tool reruns only when **both the stored policy and the current registered policy are `safe`**. Otherwise the harness commits an `interrupted` error result containing durable partial output; the generation can continue with that result. Recovery does not rerun `beforeTool`, although execution and result hooks still apply. [P6, P7]

Declaring `safe` is a promise made by the host/tool author. If an external effect completed but the Pi result commit did not, safe replay may execute again. Nested-call keys and submission request IDs deduplicate their own durable admissions; neither makes an arbitrary external side effect exactly once. The specification explicitly requires idempotency for replay-safe tools with external effects. [P6, P7]

An interrupted ordinary model request is resent from its committed request checkpoint. Any committed partial is first converted to an aborted assistant entry. This is a new provider request, not resuming the old token stream; it can incur duplicate spend and produce a different response. Deferred provider requests have a separate polling path. Default model-error policy permits three retries after the initial attempt. [P6]

Live partial answers and tool output are persisted at a default interval of 100 ms, so the uncommitted progress window can be lost. Increasing the interval is documented for remote stores. Persisting observed progress does not preserve an unrecorded external effect or provider outcome. [P3, P6]

**A storage failure terminates the harness.** A storage method's fatal error rejects pending waits, signals running tasks and closes the session. The storage adapter must retry transient failures internally; the harness does not hold the completed effect in a paused persistence-only recovery controller. Reopen recovers from committed checkpoints. Invalid read requests and cancelled reads have narrower exceptions. Close waits for running task code to return, so code ignoring cancellation can delay shutdown. [P3, P6]

## Fit with Vaulter's decisions

Vaulter already records an Agent run, exact supplied inputs, tool invocation and outcome as Nodes in the Vault. It accepts invocation records before tools can produce module effects. Save recovery retries the exact finalized Transaction request, retaining the same live result rather than rerunning a model or tool. Reopening an accepted run is read-only; unfinished historical effects remain explicitly uncertain. [V1, V2, V3]

These behaviors are related but not interchangeable:

| Concern | Vaulter today | Pi Durable 1.3.0 |
| --- | --- | --- |
| Reopen unfinished execution | Read recorded state; no model/tool starts. | Scheduler resumes pending work; safe tools may run again and model requests may repeat. |
| Outcome save fails | Retain live outcome and finalized request for persistence-only retry. | Fatal storage error closes harness; recovery uses last durable checkpoint. |
| Tool ordering | Durable module tools execute sequentially within a run. | Default tool rounds are parallel; configure sequential execution to preserve ordering. |
| Authoritative history | Immutable Node versions and Transactions published to GitHub. | Entries, task records, submissions and Chord documents in its Storage. |
| Concurrency ownership | Local live controllers/session scopes; no cross-device execution lease. | One process owns storage; no cross-process locking supplied. |

[V1, V2, V3, V4, P3, P6]

ADR 0009's persistence retries must remain persistence-only. A **new explicit execution-resume feature** could be designed alongside that decision; adopting Pi's scheduler must not silently turn a save retry or historical read into execution. Full replacement would also need to retain Vaulter's exact Node-version references, trusted author/origin and honest uncertain-effect presentation. [V1, V2, V3]

Vaulter's GitHub adapter is authoritative; Dexie is a read cache and local cache acceptance is not remote acceptance. Commits require network access. Pi's default frequent progress commits and mutable task/document state are a poor direct match for one Git publication per durable transaction. **Assessment:** this needs measurement and an explicit durability boundary, rather than mapping every Pi write mechanically to a Node Transaction. ADR 0003 already notes Git object/API growth costs. [V4, P3]

## Storage and browser compatibility

The supplied persistent adapters are Node SQLite, Node JSONL and Cloudflare Durable Object SQLite; memory storage is nonpersistent. SQLite uses WAL with `synchronous=NORMAL`: process-crash durability is distinct from power/host-failure durability. JSONL offers `fsync:true`, retains history in memory, and is discouraged for long-running agents relative to SQLite. A storage is owned by one process at a time. [P3, P6]

Custom storage is supported and has a reusable conformance suite. Its contract includes atomic batch commits, monotonically increasing sequences, a session-global numeric ID namespace surviving reopen, indexed/cursor scans in both directions, request lookup, fork-aware entry visibility, and historical document materialization from bases/deltas. **Assessment:** a Vaulter-backed implementation is possible but substantial; `TransactionStore` is not an existing Pi Storage implementation. The small `commit()` method alone understates the adapter cost. [P6, P8]

**The portable core is not categorically browser-incompatible.** Node-specific environment, image and storage adapters are separate imports, portable SQLite/JSONL cores accept host facades, and `pi-ai` documents browser support with explicit credentials and provider-specific limits. The release has no supplied IndexedDB/GitHub browser storage adapter. Browser provider transport, cancellation and bundling still need verification for our chosen imports. [P3, P5, P9]

Our browser build rejects emitted dynamic-code constructs. Pi uses TypeBox `Compile()` for tool arguments and structured output. Pinned TypeBox 1.3.27 contains `new (globalThis.Function)(...args)`, but also detects restricted evaluation and falls back to an interpreter. **Assessment:** CSP does not automatically imply validation fails; nevertheless, retained generated-code branches may conflict with our static bundle guard. No Vaulter production bundle with these packages was built, so this remains an integration gate, not a demonstrated blocker. Optional code mode additionally needs a deliberate sandbox implementation; it is unnecessary for a first worker experiment. [P7, P9, P10, V5]

Vaulter already has live WebRTC voice, transcription and an Agent-owned durable tool wrapper. The reviewed Pi Durable public API and specification provide the model-turn harness, not a corresponding live voice/WebRTC session adapter. **Assessment:** it would not replace our voice implementation out of the box; a replacement must preserve voice interruption, transcript save and retained-content recovery semantics separately. [V1, P3, P6]

## Scope of verification

This investigation reviewed pinned upstream source and Vaulter's implementation. No runtime changes, dependencies, paid provider calls, integration tests, browser bundle or performance measurements were introduced. The proposed acceptance checks describe how to validate a future implementation; they are not test results.

## Sources

Primary upstream sources, pinned unless the source is the registry's dated release metadata:

- **P1:** [npm registry metadata](https://registry.npmjs.org/@earendil-works%2fpi-durable), [1.3.0 metadata](https://registry.npmjs.org/@earendil-works%2fpi-durable/1.3.0) and [published 1.3.0 tarball](https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.3.0.tgz).
- **P2:** [npm publish/provenance attestations for 1.3.0](https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-durable@1.3.0); resolved Git commit matches the release's [tag reference](https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.3.0). Attestations were inspected, not independently signature-verified.
- **P3:** [Pi Durable README](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md): concepts, resume, tools, subagents, tasks, compaction, watches, storage and errors.
- **P4:** [Pi Durable changelog](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/CHANGELOG.md).
- **P5:** [Pi Durable package manifest](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/package.json).
- **P6:** [Normative specification](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/docs/spec.md): sections 5 task lifecycle, 7.3 tools, 8.3 generation, 8.4 tool recovery, 8.7 compaction, 10 storage, and the backend/limitation sections.
- **P7:** [Tool implementation](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/harness/tool.ts).
- **P8:** [Storage types](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/types.ts), [storage conformance suite](https://github.com/earendil-works/pi/tree/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/src/testing).
- **P9:** [pi-ai browser documentation](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/ai/README.md#browser-usage), [tool argument validation](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/ai/src/utils/validation.ts).
- **P10:** [TypeBox 1.3.27 published tarball](https://registry.npmjs.org/typebox/-/typebox-1.3.27.tgz): README compiler documentation, `build/schema/build.mjs`, `build/system/environment/evaluate.mjs`. [Version metadata](https://registry.npmjs.org/typebox/1.3.27).

Local project evidence, reviewed at this checkout:

- **V1:** [Agent README](../../app/agent/README.md), [runtime](../../app/agent/runtime.ts), [provider interfaces](../../app/agent/providers.ts), [tool execution](../../app/agent/tool-execution.ts).
- **V2:** [ADR 0009: scoped write admission and finalized request recovery](../adr/0009-scoped-transaction-writes.md).
- **V3:** [Agent recovery tests](../../app/agent/recovery.test.ts), particularly `an unfinished historical invocation exposes uncertain effects without starting a model or tool`; [local ownership](../../app/agent/ownership.ts).
- **V4:** [Glossary](../../GLOSSARY.md), [ADR 0002: versioned Node model](../adr/0002-versioned-node-model.md), [ADR 0003: GitHub persistence](../adr/0003-github-node-persistence.md), [ADR 0004: plaintext cache](../adr/0004-plaintext-device-cache.md).
- **V5:** [Browser no-eval build guard](../../tools/build/no-eval.ts), [Vite configuration](../../vite.config.ts).
