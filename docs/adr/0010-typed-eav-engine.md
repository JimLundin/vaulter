# Use a typed entity interface over an EAV engine

Vaulter uses an EAV engine with declarative, persisted schema definitions, opaque entity
identity, atomic callback transactions and queryable history. Design the engine around the desired
application interface. [Vault EAV](../../app/vault/eav/README.md) owns the engine and
[ADR 0014](0014-eav-only-vault.md) records adoption across all application owners.

[ADR 0011](0011-chat-agent-eav-adoption.md) records the subsequent durable adapter and live Chat adoption.

Register definitions once at database open. Entity handles infer creation data, partial updates,
references and selected result shapes. Objects carry a hidden identity through projections and
spreads; callers do not pass IDs or compare content to identify an entity. Object query specifications
express nested reference selections directly. `query` returns a collection, and `first` returns one
projected object or `undefined`. Both are available on live, transactional and historical readers.

The database handle uses `await using` for resource lifetime. Transactions use callbacks and commit
only on successful completion. JavaScript disposal does not receive a scope's exception, so a
transaction disposer cannot independently choose commit versus rollback. A manually controlled
transaction interface is not currently required. The callback exposes only the three writes:
insert, update and delete.

Accepted transactions retain schema revisions and net changes. History can browse transactions,
entity changes and snapshots through the same typed reading concepts. Stable schema keys separate
property renames from meaning changes; incompatible definitions require explicit migration. This
interface governs the application. ADR 0003 defines durable publication, ADR 0005 defines historical
citation selections and ADR 0007 keeps private source translation outside application owners.
