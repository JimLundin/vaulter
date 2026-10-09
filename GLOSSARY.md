# Vaulter

Vaulter represents its application data as interconnected nodes.

## Language

**Node**:
An individually addressable part of the application's data that can connect to other nodes. Its
identity persists when its content or placement changes.

**Relationship**:
A named connection between nodes.

**Containment**:
The placement of a node within a parent node, including its order among that parent's children.

**Appearance**:
A node representing one placement of shared content within a parent node. Several appearances can
refer to the same content node.

**Node version**:
An immutable record of a node's state at a point in its history.

**Transaction**:
A group of changes recorded and applied together as one unit.

**Closure**:
The live nodes reachable from a root through containment and references at a particular point in
history. A node can belong to several roots' closures.
