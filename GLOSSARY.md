# Vaulter

Vaulter represents its application data as interconnected nodes.

## Language

**Node**:
An individually addressable part of the application's data that can connect to other nodes. Its
identity persists when its content or placement changes.

**Relationship**:
A named connection between nodes.

**Connection**:
The source and target addressed by a relationship node, independently of that node's placement.
Each endpoint may refer to a node identity or an exact recorded version.

**Containment**:
The placement of a node within a parent node, including its order among that parent's children.

**Appearance**:
A node representing one placement of shared content within a parent node. Several appearances can
refer to the same content node.

**Node version**:
An immutable record of a node's state at a point in its history.

**Node address**:
A reference to a node identity, optionally qualified by the transaction that recorded a particular
version. A version's own address always identifies that exact version.

**Snapshot**:
The recorded state of the vault after a particular transaction, including the version of each node
present at that point in history.

**Transaction**:
A group of changes recorded and applied together as one unit, with its author and originating
context retained in history.

**Transaction author**:
The user, agent, or system responsible for producing a transaction's changes, represented by a node.

**Transaction origin**:
The context from which a transaction arose, such as a chat exchange or import. It is distinct from
the author of the changes.

**Transaction kind**:
A classification of the operation recorded by a transaction, with a scope and an action,
interpreted by the feature that owns it.

**Closure**:
The live node versions reachable from a root through containment and connection targets in a
selected snapshot. Different versions of one node may be reachable through exact references.

**Observation**:
A recorded measurement or collection outcome about the circumstances of an exchange, retaining
when it describes the world and where it came from.

**Agent run**:
One execution of an agent in response to an exchange, with its supplied information and resulting
activity retained.

**Interpretation**:
An attributed reading of recorded evidence, such as a summary, inferred event or decision. Later
corrections coexist with the original interpretation.
