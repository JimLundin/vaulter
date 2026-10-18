## Performance requirement: full journal admission and historical reading

Migration parallelism is currently constrained by repeated full-prefix native validation and snapshot replay. These are runtime costs, separate from missing domain fields.

Observed 2026-10-18 against pinned application commit `793a71fe9fcd3eb4ac40603d679737fc8a26312c`:

- `app/application/persistence/journal/github.ts:111`: cold synchronization calls `parseJournal` on the entire accumulated journal after every downloaded transaction.
- `app/application/store/persistence.ts:169`: for each added historical reference, `parseJournal` replays the whole referenced prefix to validate its target. It also validates every complete post-transaction snapshot.
- `app/application/store/memory.ts:147`: `snapshotAt` replays from transaction one for each noncurrent snapshot lookup. `history.resolve`, `history.inspect`, and historical entity queries repeat this work.

A focused synthetic probe using unmodified native schema, transactions, historical references, `parseJournal`, `history.resolve`, and `history.inspect` measured:

| Transactions / historical facts | One final full native parse | Repeating full parse after every transaction |
| --- | ---: | ---: |
| 40 / 39 | 42.2 ms | 256.7 ms |
| 80 / 79 | 60.9 ms | 1,953.9 ms |
| 160 / 159 | 337.8 ms | 13,300.3 ms |

The 80-to-160 cold synchronization pattern grew 6.8 times for twice the input. At 160 transactions, repeating full parsing was 39.4 times slower than one final full parse. This synthetic sample establishes the scaling problem; it does not predict the production vault completion time.

Requested Vaulter response:

1. Stage the entire downloaded ordered journal, check each immutable request's base, identity, path, sequence and schema-prefix correspondence, then run full native validation once before accepting any of the batch. Failed validation must leave the accepted journal, cache and remote bytes unchanged.
2. Validate historical targets against exact accepted historical states without replaying the prefix per historical fact. A transaction-scoped lookup/index or bounded snapshot cache can preserve full validation.
3. Make repeated historical reads reuse exact snapshots, with invalidation on journal replacement, refresh or close and bounded memory use. Preserve entity identity, wrong-scope rejection, unavailable-target rejection, deletion visibility and selected historical state.
4. Add focused regression evidence for corrupt/forked/schema-rewritten journals, invalid historical targets, foreign addresses, and unchanged history behavior; include a measured benchmark at increasing journal sizes.

Private migration tooling has a new adapter verifier v6, not yet queued: it memoizes only successfully checked exact immutable addresses/selectors and removes a redundant local preparse while the native store still performs its complete parse. The remote adapter remains unmodified and still performs the full native GitHub readback. This helps repeated checks but cannot fix cold synchronization scaling by itself.

Evidence: `/tmp/vault-native-journal-performance-probe-20261018.json` and migration scripts `knowledge-native-journal-performance-probe.mjs`, `knowledge-production-adapter-reopen-v6.mjs`, `knowledge-adapter-v6-performance-feedback.mjs` in the vault tooling checkout. These references are local development artifacts; capture relevant measurements in the committed Vaulter feedback document.
