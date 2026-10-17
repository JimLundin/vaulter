# Publish immutable EAV transactions through GitHub

GitHub is the authoritative persistence adapter for the Vault. The configured private repository
and branch retain immutable EAV transaction envelopes with schema revisions under
`.vaulter/eav/transactions/`. Git ref compare-and-swap publishes one complete transaction atomically,
preserving unrelated repository paths. Transaction identity and sequence are independent of Git commits.

A plaintext IndexedDB cache supports offline reads; writes require remote acceptance. Lost
acknowledgements retain the same finalized publication for retry. Cache or notification failure
after remote acceptance cannot turn acceptance into rejection. Sign-out clears device data and
closes the adapter while retaining remote history. Credentials never enter transaction records.

GitHub reuses the application's Git client and credentials without introducing a dedicated server.
This trades per-transaction API calls and cold-history reconstruction for remote durability now.
Checkpointing and indexing require measured follow-up work; accepted history is never discarded.
[ADR 0004](0004-plaintext-device-cache.md) governs device cache contents.
