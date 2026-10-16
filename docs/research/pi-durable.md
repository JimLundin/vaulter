# Pi Durable and Vaulter

Research snapshot: **2026-10-16**. Package: **`@earendil-works/pi-durable` 1.3.0**, not Pi's CLI or a generic durable-workflow library. Investigated published npm files and the release's source and normative specification; no dependencies or runtime code changed.

## Recommendation

**Assessment: keep Vaulter's current Agent runtime. Pi Durable is worth a narrow experiment if we decide to build agents or jobs that continue while the browser is closed.** Its strongest additions are restartable task graphs, persistent subagents, queued follow-ups and context compaction. It overlaps substantially with our existing durable run/tool records, while introducing another persistence model and different failure behavior.

For browser-only improvements, compare extending Agent with an explicit execution-resume or compaction feature before replacing it. For work continuing after the browser closes, an active external host is required regardless of library choice. Pi Durable supplies a harness and storage adapters; it does not host that work for us. [P1, P3]

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

## A useful experiment, if always-on work is wanted

Use an isolated external worker with one fictional Node-producing job, persistent SQLite or a Durable Object, fake models, and one process owning its Pi store. Keep Vaulter's Vault and Agent interfaces as the user-facing domain owners. Compare this with a small explicit job/checkpoint addition to Agent. Do not start by migrating chat history or voice.

The crucial proof is the **two-store crash gap**: a worker's tool publishes a Node Transaction successfully, then dies before Pi records its outcome. It must persist enough finalized request identity/content before publishing to discover the same accepted Transaction after restart, reconcile its result, and avoid recalculating or republishing different changes. Merely marking the tool `safe` is insufficient. Stale-write conflicts must be reported or explicitly resolved, not silently converted into a revised retry request. [V2, V4, P6]

An experiment earns further investment only if it demonstrates:

- Reopen completes a multi-step job without duplicate Node changes after crashes at admission, effect publication and outcome checkpoints.
- Stop prevents newly admitted publications; already entered writes settle with their truthful outcome.
- Competing workers cannot execute the same job simultaneously: host-level ownership/lease enforcement is explicit.
- Agent run, tool execution, supplied context and exact evidence links remain inspectable through ordinary Vault history.
- Browser reconnect reconstructs state; work continues while the browser is closed because the external host remains active.
- Remote acceptance failures preserve recoverable publication identity, with clear user-visible uncertainty.

These are proposed acceptance gates, **not results established by this investigation**. No paid provider calls, integration tests, deployment, browser bundle, storage adapter or performance measurements were run. The evidence establishes release semantics and architectural fit; it does not establish production compatibility.

## Sources

Primary upstream sources, pinned unless the source is the registry's dated release metadata:

- **P1:** [npm registry metadata](https://registry.npmjs.org/@earendil-works%2fpi-durable), [1.3.0 metadata](https://registry.npmjs.org/@earendil-works%2fpi-durable/1.3.0) and [published 1.3.0 tarball](https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.3.0.tgz).
- **P2:** [npm publish/provenance attestations for 1.3.0](https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-durable@1.3.0); resolved Git commit matches the release's [tag reference](https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.3.0). Attestations were inspected, not independently signature-verified.
- **P3:** [Pi Durable README](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/README.md): concepts, resume, tools, subagents, tasks, compaction, watches, storage and errors.
- **P4:** [Pi Durable changelog](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/CHANGELOG.md).
- **P5:** [Pi Durable package manifest](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/package.json).
- **P6:** [Normative specification](https://github.com/earendil-works/pi/blob/71023aec1546d6d677a65669c5665c0927ce0dd0/packages/durable/docs/spec.md): §§5 task lifecycle, 7.3 tools, 8.3 generation, 8.4 tool recovery, 8.7 compaction, 10 storage and 11 limitations.
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
