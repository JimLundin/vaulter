# Own write admission with scoped lifetimes and retain finalized requests in the Vault session

Every application Node writer uses a core `WriteLifetime` through `using` or `await using`.
The core allocates the Transaction identity and pins trusted author and origin before calculation,
then validates and freezes the complete persistence request once. A fresh lifetime can retry that
exact finalized request within the same unlocked session; recovery never recalculates changes or
replays a model or tool. The original result remains the result of the initial attempt.

Disposal closes admission synchronously. Async disposal additionally drains entered persistence
through outcome recording, without waiting for arbitrary calculation, model, tool or recovery
promises. Owners keep their own execution ordering, effect completion and recovery presentation.
This separates a short write lifetime from a request that may need recovery after its initiating
scope closes, avoiding both caller-owned retry protocols and a general resource hierarchy.

Session replacement invalidates unfinished preparation and supplies a fresh reading facade while
retaining the request registry and session identity. Old adapters retire after entered writes
settle; sign-out closes admission before draining and clearing storage. History reading, its screen
and guarded compensation live with core Transactions, with Application supplying content permission.
Application facades expose no raw `commit` member. Persisted Transactions and Node versions retain
the representations in ADRs 0002 and 0003.
