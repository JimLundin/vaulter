# Node storage

The node backing model and production adapters are ready for feature integration. The existing
chat and History screens still use their file-backed workflow; this slice introduces storage,
GitHub persistence, and unlocked-session wiring. It does not migrate vault files or transcripts.
The [captured spike](https://github.com/JimLundin/vaulter/tree/33a77c4) is the design experiment;
its standalone shell, scratch keys, reset actions, and full replay reads are not shipped here.

## Application interface

`session.nodes` is a `NodeStore`, or null before the node adapter is available. `session.nodeStatus`
tracks its synchronization separately from the legacy file session. Bootstrap supplies `OpenNodes`;
the design preview supplies the memory adapter. Workflows receive no key, token, Git client, or
adapter lifecycle methods.

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

`commit` takes complete proposed states and expected previous transaction IDs. Null expects a new
identity, not a deleted one. The writer assigns acceptance sequence and recorded time and creates
one version per changed node. Source reads that informed a calculation can be declared in
`expectedReads`. Conflicts reject the complete group. Retry the same transaction ID and contents
when transport acceptance is uncertain; a changed request under that ID is rejected. The writer
context supplies required `recordedBy` and optional `origin`; those references remain valid after
deleting the actor or context. Feature/tool ingress must validate feature payloads and attribution.
The generic store validates JSON and structural integrity, not whether cited evidence supports a
claim or whether an actor has permission to edit a node.

`history` paginates by `beforeSequence` and `limit`, with optional structured operation filters.
`changes` returns complete before/after versions. `snapshot` captures immutable state at a cutoff;
`resolve` accepts an identity or exact address. `children` derives live ordered placement.
`nodeClosure` follows children and connection targets, not sources, tracking exact keys to retain
multiple versions of one identity. `undoNodes` appends guarded compensation instead of deleting
history; intervening versions reject it. Transcript preservation requires separate chat/content
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
AES-GCM encrypts the device cache with the injected nonextractable session cache key. That device
key is not suitable for cross-device remote encryption. Tokens/keys never enter transaction
records. The cache is partitioned by endpoint, repository, branch, and namespace. It stores each
envelope once plus an encrypted remote head and ownership marker; no CryptoKey is persisted there.
Signing out clears the device records and closes the adapter while retaining remote history.
Reopening under a different key discards unreadable cache data and rebuilds from GitHub.

Cached reads work offline. New commits require reachable GitHub; offline commit/staging or
cross-device branching is not introduced. Web Locks coordinate cache publication and writes
within a browser origin, while GitHub fast-forward checks coordinate remote writers. Without Web
Locks, writes are refused and read/cache clearing remain available. Broadcast notifications prompt
other tabs to refresh; they are hints, not authoritative state. Visibility/online events refresh
the session. Closing an adapter rejects queued/new operations without undoing accepted remote work.

## Validation and size limits

Persistence ingress decodes records, checks contiguous transaction sequence, attribution,
identity/exact foreign keys, placement cycles, one version per identity per transaction, and JSON.
Accepted paths may not be removed or rewritten. Unknown well-formed structured operation kinds
remain readable; their behavior belongs to features. Invalid remote records do not replace the
previous visible state. Hash-verified blobs preserve the existing Git client integrity checks.

Refresh uses conditional refs, reads only new envelopes in bounded batches, and retains decrypted
accepted records in memory. Snapshot projections are cached with bounded retention; reads do not
replay/decrypt IndexedDB on every call. First open still loads all recorded transactions, cold
validation scans accumulated history, and remote refresh lists the repository's recursive tree.
This is suitable for the first storage slice, not unlimited history. GitHub's recursive-tree limit
produces an explicit failure. Checkpoints/paged remote indexes and bounded cold reconstruction need
measurements as usage grows. No garbage collection discards referenced historical evidence.

## Verification and next slice

Adapter tests exercise atomic acceptance, exact citation retention, localized versions, historical
composition, compensation, conflicts/read dependencies, immutable metadata, retry identity, lost
responses, competing devices, encrypted reopen/rebuild, cache failures, incremental remote reads,
and refusal of altered envelopes. Session tests verify cache-before-refresh, key injection,
independent error status, close, and sign-out cleanup using fictional records.

Next, integrate submitted exchanges and responses with this store, retain reviewed staging and
ownership/cancellation, then make History read transactions and guarded compensation. These feature
changes remain tracked in [issue 19](https://github.com/JimLundin/vaulter/issues/19).

## Permanent chat metadata

[Chat metadata](chat-metadata.md) defines structured observations, message provenance, attachments,
agent runs, supplied inputs, tools and interpretations. The one-shot collection interface emits
independently timed outcomes. `recordChatMetadata` validates payloads, creates fresh identities,
and attaches exact evidence/correction references through the common store. Late collection and
corrections do not version messages or ancestors. The existing chat controller migration remains
the next slice; these interfaces do not start collection on session unlock.
