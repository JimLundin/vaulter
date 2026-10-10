# Publish node transactions through GitHub with an encrypted device cache

GitHub is the authoritative persistence adapter for the node model. The configured private vault
repository and branch retain canonical immutable transaction envelopes in a dedicated versioned
namespace. A non-forced Git ref update publishes one complete transaction atomically. A race reloads
and revalidates expected node versions before retrying. Domain transaction IDs and definitive
sequence remain independent of Git commits.

This reuses the browser application's existing Git client, credentials, repository, and hash
verification without making nodes depend on Markdown files, file validation, or Git-specific
application fields. One envelope holds transaction metadata and complete versions together;
request digests provide idempotency without storing a duplicate full request. Initial versions
establish stable identities; separate physical identity rows are unnecessary for this adapter.

Dexie caches accepted envelopes and the remote head, encrypted by the unlocked session's device
key. GitHub keeps plaintext JSON inside the private repository, matching the existing private-file
transport. The device cache key is independently generated and cannot encrypt shared remote data.
No scratch key, prototype reset, or standalone demo ships in this slice.

A successful cache write is not remote acceptance. Offline reads use cached state; commits require
GitHub. Cache or notification failure after a successful ref update cannot report rejection.
Sign-out deletes cached records and closes the adapter while keeping remote history. Cross-device
races rely on Git fast-forward checks; Web Locks additionally coordinate tabs on one origin.

The alternatives were browser-authoritative IndexedDB, which needs a new synchronization/backup
policy, and a dedicated server/database, which adds infrastructure before there is an application
need. GitHub gives atomic acceptance and remote durability now at the cost of per-transaction Git
objects, API calls, and a recursive-tree listing. Cold loading still retains all history; growth
requires measured checkpoint/index work. The namespace and format are durable storage decisions;
future incompatible formats need explicit decoding/migration, not deletion of history.

This introduces the store and session wiring alongside legacy file workflows. Chat and History
migration follows separately. Adapter tests use the actual REST client with fictional GitHub
responses; no test writes to the real private vault.
