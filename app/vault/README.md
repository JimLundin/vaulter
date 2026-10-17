# Vault

Vault owns the [typed EAV engine](eav/README.md), production journal adapter, shared Actor records,
source and Evidence schemas, core History, credentials and unlocked-session wiring. Application
composes owner schemas once; workflows use typed readers and transactions without receiving keys,
Git clients or adapter lifecycle methods. The [data model](../../docs/data-model.md) describes the
registered owners and [ADR 0014](../../docs/adr/0014-eav-only-vault.md) records the single-store decision.

## Reading, writing and evidence

Entity objects carry opaque stable identity. Transactions publish net assertions and retractions
atomically; invalid writes, exceptions and stale snapshots reject the complete change set. Callback
calculation never runs again automatically. Trusted transaction authors and origins come from callers.

Live references require live targets. Owners use explicit content availability where removal must
retain shared placement. Validated historical references address accepted snapshots and remain readable
after later edits or deletion. Evidence owners define projection formats and selection ranges;
[ADR 0005](../../docs/adr/0005-wiki-citation-selections.md) governs historical passages and source eligibility.

## Persistence and session lifetime

`storage/eav/` publishes immutable schema and transaction envelopes under `.vaulter/eav/transactions/`
in the private repository. Git ref compare-and-swap is authoritative acceptance and preserves unrelated
paths. A plaintext IndexedDB cache supports offline reads; new writes require remote acceptance.
Credentials remain encrypted and never enter records. Failed or uncertain saves retain the exact
publication for persistence-only retry, without replaying model requests or tools.

Session owns the one journal lifecycle. Credential replacement reconnects storage, and sign-out
drains entered writes before clearing device data and closing the adapter. Accepted remote history
remains. Fictional memory persistence powers previews and focused behavior checks.

## History and source boundaries

Core History reads accepted transactions, historical author/origin labels and complete entity and
attribute before/after values from the same journal. Its drawer overlays the current page and draft;
Search and the keyboard shortcut open the same utility. Generic History does not import workflows
or resume execution. Schema-defined historical references preserve original evidence.

Owners interpret their own records. Application composes their source projections and actions.
Private source parsing, identity mapping and publication procedures stay with Vault tooling under
[ADR 0007](../../docs/adr/0007-vault-owned-translation.md). Opening the application does not translate
private sources or regenerate published history.

Focused adapter checks cover atomic acceptance, immutable replay, failed/uncertain saves, reopen,
cache failure and remote races. Engine checks cover typed identity, references, queries and history.
Full verification runs in CI as described by the [testing guide](../../docs/agents/testing.md).
