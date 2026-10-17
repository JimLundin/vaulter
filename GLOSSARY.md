# Vaulter

Vaulter retains connected knowledge, source material, conversations and agent activity, with recorded history.

## Language

**Vault**:
The collection of connected records and their history that holds the application's
data. Conversations and agent-produced content are part of this same collection.

**Record**:
An individually addressable part of the Vault whose identity persists when its content or placement changes.

**Relationship**:
A named, directed connection between retained records.

**Containment**:
The placement of content within a parent, including its order among that parent's children.

**Appearance**:
One placement of shared content within a parent. Several appearances can refer to the same content.

**Historical reference**:
A reference to a retained record in a particular recorded state of the Vault.

**Snapshot**:
The recorded state of the Vault after a particular transaction.

**Transaction**:
A group of changes recorded and applied together as one unit, retaining available author and originating context.

**Transaction author**:
The user, agent, or system responsible for producing a transaction's changes.

**Transaction origin**:
The context from which a transaction arose, such as an exchange or import, distinct from its author.

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

**Topic**:
A broad subject explicitly chosen to organize a recurring area of inquiry or activity.
Narrower subjects and their material can belong under a topic without becoming topics themselves.

**Topic membership**:
An editorial association of a subject or its material with a topic. Membership does not assert
a factual relationship between subjects.

**Claim**:
An assertion that can be reviewed against retained source material, expressed in prose or by a
structured record.

**Source document**:
An independently retained document or excerpt with its origin and attribution preserved.
Capturing a document preserves what it said without certifying its assertions.

**Review**:
An attributed assessment of a particular claim and the material considered for it. Its conclusion
applies to the assertion that was reviewed.

**Challenge**:
An attributed connection between a claim and source material considered to contradict it,
retaining the disagreement without deciding the claim's truth automatically.

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

**Coordinate record**:
A retained geographic position associated with another Record, expressed in an explicit coordinate
reference system. Several Coordinate records can describe the same Record.

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
