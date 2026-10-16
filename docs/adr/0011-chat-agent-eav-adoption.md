# Record live Chat and Agent execution in EAV while other producers migrate

Chat owns Conversation, Exchange, Message and ordered text/tool parts. Agent owns Agent configuration,
Agent run, accepted tool capabilities, Context input and Tool execution. References express those
relationships directly. Runs do not require a Conversation or Exchange. Actor is shared attribution.
Each run copies its effective configuration and ordered provider inputs; editing an Agent does not
rewrite the meaning of earlier runs. Tool parts reference Agent receipts rather than copying outcomes.

The schemas and domain operations are in `app/workflows/chat/data` and `app/agent/data`. Application
registers their combined schema once. Generic EAV writes validate structure; producer operations
enforce lifecycle rules, ordering, accepted tool membership and response/run ownership. Ordinary
callers use opaque entity objects. Chat's route and submission records isolate the existing shell's
navigation keys and transport retry keys from domain identity.

The production entry supplies an independent GitHub EAV adapter. Immutable transaction envelopes
under `.vaulter/eav/transactions/` retain schemas and fact assertions/retractions. Atomic Git ref
updates coordinate with existing Node writes without replacing unrelated paths. A plaintext device
cache supports offline reads; writes require remote acceptance. An uncertain save retains its exact
publication for explicit retry, without rerunning a callback, provider or tool. Session disposal and
credential replacement also cover EAV storage. The cache is cleared on sign-out.

New production chat submissions and their Agent execution use EAV. Previously accepted Node
conversations remain readable and can receive new EAV exchanges without rewriting historical data.
The retained Chat interaction now consumes a storage-independent backend interface. The old backend
remains available to callers and fixtures while they migrate. Independent legacy Agent/voice callers
also retain their current entry points; the EAV execution path is available separately.

Unmigrated content tools still require Node authors, origins and exact citation endpoints. A small
immutable `externalRecord` backlink identifies an EAV run, and message text excerpts supply exact
evidence for those readers. These compatibility records do not own the conversation or execution
lifecycle. Provider execution waits for initial compatibility publication as well as EAV acceptance.
Response evidence has its own retained save obligation. There is no atomic transaction spanning both
stores; stage-specific recovery makes that limitation explicit without replaying effects.

This advances ADR 0010 and narrows the scope of ADRs 0002, 0003 and 0009 for production Chat. Their
rules continue to apply to producers using Nodes. Existing exact citations in ADR 0005 remain
readable; ADR 0007's historical formats are not rewritten. EAV history is available through its
database interface; migrating the generic History screen and importing old physical history are
separate producer migrations.
