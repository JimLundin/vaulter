# Use a typed entity interface over an EAV engine

Vaulter will move to an EAV engine with declarative, persisted schema definitions, opaque entity
identity, atomic callback transactions and queryable history. Design the engine around the desired
application interface, independently of the existing Node representation. Its initial standalone
implementation is [Vault EAV](../../app/vault/eav/README.md); application migration and durable
persistence integration remain subsequent work.

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
interface takes precedence for the new engine. ADRs 0002, 0003, 0005, 0007 and 0009 still describe
the active application's Node storage and preservation obligations until a separately implemented
migration replaces that integration.
