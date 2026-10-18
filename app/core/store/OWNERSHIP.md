# Core store ownership

The core application owns the [typed store](OWNERSHIP.md), production journal persistence, session
lifetime, Settings and Transaction History. The [project layout](../../../README.md) identifies the
other domain owners. Actors, Source documents and Wiki Reviews live with their domain behavior.

Application composes owner definitions in `database.ts`. The store accepts that registry and has no
knowledge of Conversation, Agent, Wiki, Graph, Questions, Calendar or Map. Domain callers receive typed
readers and Transactions, without keys, Git transport or persistence lifecycle methods.

The journal records immutable accepted Transactions and schema definitions. Failed or uncertain
publication retains the exact request for explicit persistence-only retry. Historical references
remain readable after later edits or removal. Domain interpretation stays with the record owner.

Session manages the single persistence lifetime. Credential replacement preserves entered work;
sign-out drains publications before clearing device cache and retiring the adapter. Settings edits
safe credential projections. Core History reads accepted journal changes without resuming effects.
