# Throwaway node storage spike

Question: can the existing agent chat and History use one versioned node store while keeping
content edits, placement changes, deletion, and undo local to the affected nodes?

Verdict: **yes for the exercised scenarios**. Keep the proposed backing model and NodeStore seam;
use Maps for volatile state/preview and Dexie for browser persistence. This branch is a primary
source for the experiment, not production-ready application storage.

## Run

Open [demo.html](demo.html) directly in Chrome. It is a self-contained file: no install, server,
or network request is required. Choose Memory or IndexedDB, try actions, or select a guided
walkthrough. The panels show visible content, all recorded node identities at the selected cutoff
(including tombstones and unreachable nodes), complete differences, and transaction History.

The demo uses fictional data in `PROTOTYPE-vaulter-node-storage-wipe-me`. Walkthroughs reset the
selected store. Use only one demo tab when resetting. After a page reload, choose IndexedDB to
reopen its retained records; Memory starts fresh. Reopening a store does not resume a running model
request. The spike's reply buttons simulate a terminal response without invoking an agent.

From this branch, with dependencies installed:

```sh
npm run spike:nodes
npm run spike:nodes:build
```

The first command runs the same executable scenario probe against Maps and actual Dexie with
fake-indexeddb, then checks encrypted rows, upgrades, and two concurrent connections. The second
rebuilds the shareable HTML using the project's existing Vite dependency. The generated HTML is
excluded from Biome because it embeds third-party library code; its authored sources are checked.

## Observed behavior

| Action | Versions recorded / observed |
| --- | --- |
| First Send | Conversation, exchange, user message, assistant placeholder |
| Later Send | Exchange and two messages; conversation stays at its original version |
| Content edit | Shared paragraph only; both appearances resolve its updated state |
| Reply completion / Stop | Assistant message only; previously committed content survives |
| Content undo | Compensating content versions; conversation and responses remain |
| Remove one appearance | Appearance tombstone only; shared target and other appearance remain |
| Delete shared target | Target tombstone only; both appearances retain their target identities |
| Restore target | Target version only; retained appearances resolve it again |
| Move a group | Group version only; descendant keeps its original version |
| Delete a group | Group tombstone only; descendants become unreachable, remain stored |
| Restore a group | Group version only; reveals current descendant states, including edits made while hidden |
| Make an appearance independent | New content identity plus retargeted appearance |
| Stale multi-node write / read dependency | Whole request rejected without advancing history |
| Undo after an intervening affected-node edit | Whole compensation rejected |
| Retry an accepted request | Original acceptance returned; changed contents under that ID rejected |
| Concurrent independent writes | Both accepted with distinct sequential transactions |
| Concurrent writes to the same node | One acceptance, one expected-version conflict |

Historical snapshots continue to resolve versions at their own cutoff. Accepted JSON is copied and
frozen. Target cycles terminate through a visited set; containment cycles are rejected. Restoring a
container at the latest snapshot restores reachability, not its descendants' old contents. Reading
an old snapshot is how to see that earlier closure.

The parity probe finishes with 17 transactions, 15 identities, 30 immutable version rows, and
15 current rows. Retrying does not add rows. Chrome exercised all six browser walkthroughs, selecting
History, encrypted scratch storage, close/reopen, and full page reload, with no page errors.
TypeScript, Biome CI, and the existing layout/composition checks (33 assertions) passed.

## Implementation shape

[prototype.ts](prototype.ts) implements both adapters through the existing
[NodeStore contract](../store.ts). Callers submit complete proposed states and expected last
transaction IDs. They read immutable snapshots and transaction differences without table access.
[scenarios.ts](scenarios.ts) demonstrates the chat payloads and commit boundaries.

Dexie writes identity rows, an encrypted transaction envelope, encrypted immutable versions,
changed current rows, and a sequence counter in one short IndexedDB transaction. Opaque identities,
version membership, and sequence stay plaintext; data, parent, target, order and History metadata
are encrypted using the existing AES-GCM helper. Structural indexes are derived after decryption.

Crypto preparation happens before the database transaction. Publication checks the global log head
inside it; an advanced head triggers reread, expected-version validation, and retry. This allows
independent writers while rejecting stale affected-node or declared-read dependencies. Notifications
are refresh hints, not a second source of state.

## Production work still required

- Inject the unlocked vault session key. The demo retains a nonextractable scratch CryptoKey in
  the same database solely to exercise reopen; it provides no user unlock boundary.
- Replace full transaction replay on every read with bounded history queries, maintained in-memory
  indexes after unlock, and checkpoints as needed. Current/version tables demonstrate the physical
  shape but are not yet used to accelerate reads. Payloads also appear in the encrypted transaction
  envelope, so measure that duplication before choosing a production layout.
- Add reviewed staging, content/schema validation, workflow ownership/cancellation, and the real
  chat/History integration. The spike invokes no model, tools, microphone, or production vault.
- On restart, classify stored running responses with no live owner as interrupted. Do not resume
  tools merely by reconstructing messages.
- Settle synchronization, backup, offline acceptance, and sign-out/retention policy. IndexedDB
  persistence proves local reload durability; it is not cross-device synchronization.
- Define production migration/error handling and transaction pagination. The demo's exclusive reset
  and full replay are intentionally limited to small scratch data.

The foundation branch `node-data-model` holds the accepted types and decision. The throwaway
`spike/node-storage` branch captures this implementation and self-contained demo. Port validated
logic deliberately; keep the demo and scratch-key behavior out of the running app.
