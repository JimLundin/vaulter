# Node storage

Vaulter's central node storage contract, production adapters,
and unlocked-session wiring are integrated into `structure` from PR #21. All features will produce data into this one store or represent its
recorded data. Valid submitted content is preserved; edits and undo append new versions and
transactions without modifying earlier records.

[Chat](chat-nodes.md) and [independent Agent](agent-records.md) produce accepted nodes through this
contract, and Application supplies models, identities and module-owned tools explicitly. Core
[History operations](node-consumers.md) and the History screen read transactions and prepare guarded
compensation. Search reads Wiki node entries; sensor collection is not part of this
producer integration. Migration is separate work inside the Vault.
The [captured spike](https://github.com/JimLundin/vaulter/tree/33a77c4) is the design experiment;
its standalone shell, scratch keys, reset actions, and full replay reads are not shipped here.

## Application interface

`session.nodes` is a `TransactionStore`, or null before the node adapter is available. `session.nodeStatus`
tracks node synchronization; `session.ready` records whether accepted cached or remote data is available. Bootstrap supplies `OpenNodes` from `app/vault/session/adapters.ts`;
the design preview supplies the memory adapter. Workflows receive no key, token, Git client, or
adapter lifecycle methods. Read-only consumers use `NodeReading`; application writers receive the
same reads plus `writer(context).lifetime()`. The facade has no raw `commit` member, even at runtime.

Node persistence lives in `app/vault/storage/nodes/` and uses `storage/github-client/`
with node-scoped browser locks. The application has no file persistence adapter. Session owns credential-bearing adapter constructors;
`vault/nodes/` depends only on the Node model and generic Runtime helpers.

```ts
const snapshot = await nodes.snapshot();
const evidence = snapshot.get(evidenceIdentity);
if (!evidence || evidence.data === null) throw new Error('Evidence unavailable');

const cited = evidence.key; // exact immutable version address
const following = { node: evidence.key.node }; // identity in the viewing snapshot
```

`NodeVersion` groups `key`, `placement`, `connection`, and `data`. An address is `{ node,
transaction? }`; a version's own key requires transaction. Exact endpoint references must identify
an existing version pair, including versions created together by that transaction. They do not
interpret the transaction as a cutoff. Identity addresses inherit the viewing snapshot.
Placement's parent is an identity; connections describe source/target independently of placement.

Every application write uses `using` or `await using`, as decided in
[ADR 0009](adr/0009-scoped-transaction-writes.md):

```ts
using writes = nodes.writer({ recordedBy: userId, origin: null }).lifetime();
const request = writes.write(async ({ id, nodes: reading }) =>
  calculateChanges(await reading.snapshot(), id),
);
const receipt = await request.result;
```

The callback returns `{ value, transaction }`. Core allocates its ID and pins trusted author and
origin before the callback runs. It validates, copies and freezes only persisted JSON; the owner
value keeps its identity. `prepare()` calculates the same way but waits for explicit `accept()`.
`ready` resolves the calculated value; `result` permanently represents the initial attempt.

Proposed changes contain complete states and expected previous Transaction IDs. Null expects a new
identity, not a deleted one. `expectedReads` guards source reads used by a calculation. Composition
rejects duplicate changed Nodes and contradictory expectations, retaining explicitly required reads.
Persistence assigns acceptance sequence and recorded time and creates one version per changed Node.
Author and origin may be created in that same request, and historical references survive deletion.

After uncertain acceptance or closure before publication, a fresh lifetime with the same author and
origin calls `retry(request)`. Only finalized requests can be retried; neither their ID nor their
contents change, and their calculation never runs again. Same-request attempts coalesce while
independent requests may enter concurrently. Conflicts and structural/publication rejections are
definitive; core never rebases them. Recovery returns its own receipt without replacing `result`.

Both disposal symbols close admission synchronously. Async disposal also waits for entered adapter
promises through recording their outcomes. It does not wait for arbitrary calculation, model, tool
or recovery promises. Owners retain their own effect-completion and ordering policies.
Replacement invalidates unfinished calculation immediately, preserves finalized requests and session
identity, and supplies a fresh reading facade. Previously borrowed facades direct new reads and writes
to the current adapter. Sign-out closes admission, drains entered writes, then clears and closes storage.

Application ownership is composed by Application on top of that generic interface. Its supplied
TransactionStore always forwards the Questions publication rule; application callers cannot replace it.
The rule runs synchronously inside actual acceptance after authoritative refresh in both adapters,
before publishing any new Transaction. Questions interprets the previous and proposed records and
verifies that its create or answer action produced the complete changes and required reads.
Persistence imports no Questions definitions and serializes no publication permission.
Historical validation and an identical already-accepted retry do not invoke new-action admission.
Raw adapter construction and acceptance/loading functions stay with bootstrap, persistence and
historical fixtures. Raw `NodeStore.commit` stays inside core Transactions and persistence. Session
hooks remain with Vault assembly and Application, and
preview fixtures remain outside production callers. Compiler-resolved ownership checks in
`tools/layout.test.ts` enforce these paths through aliases and re-exports.

`history` paginates by `beforeSequence` and `limit`, with optional structured operation filters.
`changes` returns complete before/after versions. `snapshot` captures immutable state at a cutoff;
`resolve` accepts an identity or exact address. `children` accepts a parent identity or address and
derives live ordered placement at the viewing cutoff. An exact live parent version exposes those
children even when the parent's current identity state is deleted; an absent or deleted addressed
parent exposes none.
`nodeClosure` follows children and connection targets, not sources, tracking exact keys to retain
multiple versions of one identity. `transactionHistory()` retains guarded compensation requests
instead of deleting history; intervening versions reject them. Transcript preservation requires separate chat/content
transactions in the consuming workflow.

An exact root address fixes that record, not its descendants. Select a historical snapshot to
reconstruct an entire page or conversation. Citation ranges remain typed feature data, without
rewriting evidence or copying quote text. Feature projections can compare the addressed versions
with the current-view identity versions to indicate newer or deleted content.

## GitHub authority and device cache

`githubNodeBackend` reuses the Git Data REST client with the configured private vault repository
and branch (`VITE_VAULT_REPO`). Each accepted transaction adds one canonical JSON envelope at
`.vaulter/nodes/v1/transactions/<encoded-transaction>.json`. It contains format 1, the transaction,
complete versions, and a SHA-256 request digest for retry identity. Node identities are derived
from initial versions. Git hashes, paths, format, and request digests are adapter concerns.

Commit loads the authoritative head, validates expectations and the resulting structure, chooses
the next node sequence, creates blob/tree/commit, then moves the ref with `force: false`. The new
tree is based on the repository's existing tree, preserving legacy and unrelated files. A competing
writer causes a bounded reread/revalidation/retry. Identical accepted IDs return the original
acceptance. A lost ref-update response is reconciled when possible; otherwise the caller retries
the same ID. Nothing becomes accepted locally before GitHub acceptance. Device-cache or observer
failure after acceptance cannot turn a successful commit into a rejected one.

The configured GitHub repository stores JSON plaintext, as it already stores private vault files.
The device cache stores plaintext structured values, with no cache keys or ownership markers.
Credentials in `secrets.json` remain password-encrypted and never enter transaction records.
The cache is partitioned by endpoint, repository, branch, and namespace. It stores each envelope
once plus a plaintext remote head; no CryptoKey is persisted there.
Signing out drains entered writes before clearing device records and closing the adapter, while retaining remote history.
A new unlock retains plaintext cache data; signing out clears it. The plaintext cache format
resets old encrypted device records without migrating them; remote history refills on refresh.

Cached reads work offline. New commits require reachable GitHub; offline commit/staging or
cross-device branching is not introduced. Web Locks coordinate cache publication and writes
within a browser origin, while GitHub fast-forward checks coordinate remote writers. Without Web
Locks, writes are refused and read/cache clearing remain available. Broadcast notifications prompt
other tabs to refresh; they are hints, not authoritative state. Visibility/online events refresh
the session. Closing an adapter rejects queued/new operations without undoing accepted remote work.

## Validation and size limits

Persistence ingress decodes records, checks contiguous transaction sequence, attribution,
identity/exact foreign keys, placement cycles, one version per identity per transaction, and JSON.
Validation preserves submitted JSON keys and values, including keys such as `__proto__`, in node
content, transaction metadata, and declared reads. Invalid inputs are rejected;
validation does not sanitize or rewrite accepted content. Edits append new versions and never
modify previously recorded versions.
Accepted paths may not be removed or rewritten. Unknown well-formed structured operation kinds
remain readable; their behavior belongs to features. Invalid remote records do not replace the
previous visible state. Hash-verified blobs preserve the existing Git client integrity checks.

Refresh uses conditional refs, reads only new envelopes in bounded batches, and retains accepted
records in memory. Cold validation builds identity, transaction, version and placement indexes
incrementally, validating each proposed transaction against the accepted prefix. Historical
snapshots share those indexes and resolve versions by cutoff; child lists are built on demand.
Differences look up the preceding versions directly. Snapshot projections retain bounded caches;
reads do not replay IndexedDB on every call. Indexes are private to Vault and contain generic node
structure; feature interpretation remains with its owning module.

Device-cache decoding and imported-history validation yield to browser tasks between envelopes
after an 8 ms work budget or 32 records. Validation completes before any new history is published;
invalid suffixes leave existing snapshots intact. Each envelope is still decoded and validated
atomically, so a single unusually large transaction can exceed the budget.

First open still loads all recorded transactions, and remote refresh lists the repository's
recursive tree. This is suitable for the current storage slice, not unlimited history. GitHub's recursive-tree limit
produces an explicit failure. Checkpoints/paged remote indexes and bounded cold reconstruction need
measurements as usage grows. No garbage collection discards referenced historical evidence.

## Verification and current integration

Adapter tests exercise atomic acceptance, exact citation retention, localized versions, historical
composition, compensation, conflicts/read dependencies, immutable metadata, retry identity, lost
responses, competing devices, plaintext reopen/rebuild, cache failures, incremental remote reads,
and refusal of altered envelopes. Session tests verify cache-before-refresh, credential injection,
independent error status, synchronous replacement invalidation, delayed adapter retirement, and
sign-out draining and cleanup using fictional records. Core tests cover scope closure, immutable
retries, admission, independent writes, composition, original-result retention and disposal.

Application integration tests exercise Chat→Agent→content→durable receipts→response→reopened records,
independent Agent execution and producer-owned compensation. Text/voice execution and recovery use
the same TransactionStore. No test accesses the private Vault or performs the separate migration.
