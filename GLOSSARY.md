# Vaulter

Vaulter retains connected knowledge, source material, conversations and agent activity, with recorded history.

## Language

**Vault**:
The collection of connected records and their history that holds the application's
data. Conversations and agent-produced content are part of this same collection.

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

**Transaction request**:
A proposed group of changes with its intended author and originating context. Repeating a request
seeks acceptance of those same changes; revising them creates a different request.

**Transaction author**:
The user, agent, or system responsible for producing a transaction's changes.

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
One execution of an agent, with its supplied information and resulting activity retained. A run
can originate from a chat exchange or another context without requiring a conversation.

**Actor**:
A user, agent, or system to which recorded activity can be attributed.

**Agent**:
A configured assistant with instructions, a model and available tools. Its configuration can change
without changing what an earlier run used.

**Context input**:
One ordered piece of information actually supplied to an Agent run, after selection or transformation.
It retains the supplied content independently of later changes to its source.

**Context checkpoint**:
An attributed summary of the Conversation through a recorded moment, retaining the knowledge,
decisions, goals and unresolved work needed to continue. Its source coverage remains identifiable;
later contributions continue the same Conversation.

**Model step**:
One observable model request and its response or failure within an Agent run. Its supplied context
and available response metadata describe that request independently of subsequent activity.

**Tool execution**:
One invocation of a tool during an agent run, retaining its supplied arguments, recorded outcome
and resulting activity.

**Interpretation**:
An attributed reading of recorded evidence, such as a summary, inferred event or decision. Later
corrections coexist with the original interpretation.

**Wiki**:
The collection of distilled knowledge drawn from retained sources. Wiki pages connect that
knowledge and cite the underlying source material.

**Conversation**:
The single ongoing user-agent dialogue in a Vault. Changes of subject or date continue the same
Conversation. Conversations obtained elsewhere remain retained source material with their own provenance.

**Exchange**:
An ordered contribution to the Conversation and its associated activity. It does not define a
provider request or begin a separate dialogue.

**Message**:
A person's recorded contribution, with their words and attribution retained. Native user Messages
belong to Exchanges; Agent responses are recorded as execution activity.

**Recorded summary**:
A retained account of activity or discussion whose original dialogue or speakers may be unavailable.
It is source material with its own provenance, distinct from verbatim messages.

**Subject**:
The person, topic or other matter that knowledge and questions concern.

**Question**:
An unresolved request for information about a subject, retained when asked from any context. It
remains open until an answer is recorded or it is explicitly abandoned.

**Answer**:
Recorded evidence linked to a question as its response. Its history remains part of the question
even when the evidence is later edited or removed.

**Wiki page**:
A page of distilled knowledge within the Wiki. Other retained records, such as conversations and
agent-produced reports, are source material referenced by its citations rather than Wiki pages.

**Page reference**:
A source associated with a page as a whole, describing its provenance without asserting support
for any particular statement.

**Citation**:
A connection between a selected statement and a supporting source passage, retaining the recorded
content on which that association was reviewed. Its supporting passage belongs to underlying source
material rather than another Wiki page.
