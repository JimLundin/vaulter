# Graph interfaces for understanding a subject and tracing its sources

Research date: 2026-10-16. Question: what existing interface designs could make Vaulter's Graph useful when many subjects, questions, statements, and source passages are connected?

This note uses fetched first-party documentation and the authors' Graphologue paper. Product behavior below is documented behavior, not the result of a usability comparison. Strengths, limits, and the proposed Vaulter design are our interpretation. No UI was changed as part of this research.

## What the examples suggest

The strongest combination for Vaulter is **Discourse Graphs' explicit inquiry structure**, **Bloom's selective investigation scene**, and **Graphologue's synchronized diagram and text**. Together these suggest giving the reader control over a small working graph, exposing the meaning of each relationship, and keeping the underlying text close to the diagram. They offer a useful alternative to both the whole-vault graph and the current long topic briefing. This is a design hypothesis to test in Vaulter, not a claim that every graph interface improves comprehension.

| Example | Verified behavior | Pattern worth studying | Limit for Vaulter |
| --- | --- | --- | --- |
| Obsidian | Local graph follows the active note and has adjustable depth; backlinks can show the full paragraph containing a mention. [O1][O2] | Focused neighborhood with readable textual context. | Internal links and mentions do not establish reviewed evidential support. |
| Neo4j Bloom | Search-first scene, selective typed expansion, grouping, hierarchical layout, and an inspector. [N1][N2][N3] | Build a working set around a specific investigation. | Generic graph tooling needs a smaller domain-specific vocabulary here. |
| Kumu | Search-prompted focus, adjustable neighborhood depth, field filters, named views, and field-based clustering. [K1][K2][K3][K4] | Reveal only the relevant part, with named lenses for different questions. | Shared attributes and dense connectivity alone do not establish evidential support. |
| Discourse Graphs | Questions, claims, and evidence with informs/supports/opposes relationships; a canvas can selectively add related nodes and open their notes alongside. [D1][D2] | Represent the structure of an inquiry explicitly. | This research did not establish that Vaulter has reviewed opposition relationships available to display. |
| TheBrain | Selecting a Thought makes it the centered active Thought; related Thoughts occupy parent, child, jump, and sibling zones. [T1] | Stable semantic regions while moving between subjects. | These regions describe topic organization, not evidence; the fetched source is older mobile help. |
| Graphologue | Directed diagrams and text synchronize highlighting; the interface offers original/outline/summary text, split/merged diagrams, collapsing, and saliency controls. [G1, sections 7–9] | Keep spatial exploration and text inspection synchronized. | It diagrams LLM-generated responses; its relationships are not verified citations. |

## 1. Obsidian: local graph plus backlinks

Obsidian's global graph represents notes as nodes and internal links as lines. Hover highlights connections and clicking opens a note. Its local graph instead displays notes connected to the active note, with each added depth revealing the next neighborhood. Search filters and color groups can narrow and distinguish the graph. [O1]

The backlinks panel distinguishes linked and unlinked mentions and can show a full paragraph around a mention. It updates with the active tab, or can be opened as a separate linked tab pinned to one note. [O2]

**Interpretation:** the useful transferable unit is a focused neighborhood plus context. Vaulter should let the reader inspect the passage behind a citation without losing the selected subject. A generic note-link constellation would omit the distinction between navigation, provenance, and supporting evidence.

**Material:** [graph documentation with visual](https://help.obsidian.md/plugins/graph); [backlinks documentation](https://help.obsidian.md/plugins/backlinks).

## 2. Neo4j Bloom: construct an investigation scene

Bloom describes itself as a search-first environment. Search phrases are aliases for predefined queries saved in a Perspective, including parameterized domain-specific questions; graph patterns use labels, relationship types, and properties. [N1]

After selecting a node, the reader can expand immediate neighbors, expand selectively by relationship type and direction, or use advanced expansion to choose paths and neighboring types with a result limit. Selected nodes can be grouped into one visible node; parallel relationships can be grouped with a count. A hierarchical layout arranges nodes according to relationship direction. A minimap provides scene context. [N2]

Bloom can also find a shortest path between two selected nodes; the documented command searches within 20 hops and shows the first shortest path returned. [N2] This demonstrates a concrete connection-finding operation, but a shortest path should not be interpreted as the strongest evidential explanation.

Scene selection and the card list synchronize. An inspector opens detailed properties and a node's relationships and neighbors, which can be used for further navigation. [N3]

**Interpretation:** make the user's task the query, and make expansion a deliberate action. For Vaulter, use labels such as “Show supporting passages” and “Show questions answered by this passage,” rather than expose graph configuration as the first interaction. The canvas should preserve branches already being compared when another branch expands.

**Material:** [search-first interaction](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/search-bar/); [scene interactions](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/); [hierarchical versus force layout visual](https://neo4j.com/docs/bloom-user-guide/current/_images/layouts-hierarchy.png); [advanced expansion visual](https://neo4j.com/docs/bloom-user-guide/current/_images/advanced-expansion.png).

## 3. Kumu: focus, lenses, and visible aggregation

Kumu focus temporarily hides the rest of a map around selected elements, connections, or loops. The reader can expand or contract by degree. Prompted mode begins with a search prompt rather than the full map, then builds the map around selected elements and their connections. Focus direction can include incoming, outgoing, or all connections. [K1]

Filters show or hide elements and connections using their stored fields. A view combines filters, decoration, and settings without being the underlying map itself; multiple views can apply to a map. [K2][K3] Clustering creates visible elements for field values and connections from the original elements to those values. [K4]

**Interpretation:** provide a few named lenses, such as “Question and answers,” “Supporting passages,” and “Shared sources.” Grouping should disclose what it represents and how many records it contains. A derived “shares source” view must remain distinct from an explicit citation: two statements citing one source do not necessarily support one another.

**Material:** [focus documentation, animations, and prompted-mode screenshots](https://docs.kumu.io/guides/focus); [filters](https://docs.kumu.io/guides/filter); [views](https://docs.kumu.io/guides/views); [clustering before/after examples](https://docs.kumu.io/guides/clustering).

## 4. Discourse Graphs: make the inquiry structure explicit

The Obsidian extension's base grammar defines Question, Claim, and Evidence Source nodes, with “Evidence Informs Question,” “Evidence Supports Claim,” and “Evidence Opposes Claim” relations. Its documentation explicitly motivates distinguishing theory from evidence while retaining provenance to source citations. [D1]

The canvas is an interactive visual workspace built on tldraw. It can add existing nodes, display typed relations, and selectively add a node's relations through the Context tab; adding a relation can also bring its missing endpoint onto the canvas. Removing a relation from the canvas does not delete the underlying relation. A node's note can open in a side panel. [D2]

Discourse context also exposes relationship types and related nodes from a sidebar or from an in-place popover opened via a relation-count badge on a note link. [D3]

**Interpretation:** this is the closest domain match. Treat a question and its recorded answers as a visual argument structure, with source passages reachable from statements. Preserve the difference between removing something from the working view and altering the vault. Do not add “opposes” or “contradicts” edges inferred only from prose: those need explicit recorded meaning and review.

**Material:** [base grammar](https://discoursegraphs.com/docs/obsidian/fundamentals/base-grammar); [canvas walkthrough](https://discoursegraphs.com/docs/obsidian/core-features/canvas); [in-note discourse context](https://discoursegraphs.com/docs/obsidian/core-features/discourse-context).

## 5. TheBrain: focus with stable relationship zones

TheBrain's official mobile help states that tapping a Thought centers it and makes it the active Thought. Parent Thoughts appear above, child Thoughts below, jump Thoughts to the left, and siblings to the right; attachments and notes belong to a Thought. [T1]

**Interpretation:** the valuable idea is predictable spatial meaning. In Vaulter, regions could represent questions, statements, and sources rather than borrow TheBrain's parent/child hierarchy. This could make a moderately sized neighborhood legible without free-floating circles. The fetched mobile help is not evidence for the behavior of every feature in the current desktop release.

**Material:** [official mobile help with relationship diagrams](https://help.thebrain.com/ipad/index.html), sections “Thought Relationships” and “Active Thought.”

## 6. Graphologue: diagrams and text complement each other

Graphologue converts LLM response entities and relationships into diagrams. Its interface synchronizes diagram and text highlighting and offers original, outline, and summary text views. The user can switch between split and merged diagrams, filter saliency, collapse nodes, and request explanations or examples around selected nodes. [G1, sections 7.1–7.5 and Figure 3]

The authors report a formative study with ten participants and a qualitative evaluation with seven experienced LLM users. They describe participants using synchronized representations to understand responses, alongside limitations. This is a small study of an LLM interface, not general proof that diagrams outperform text for evidence review. [G1, sections 3 and 9]

**Interpretation:** selection should make the relevant source text visible and highlight its corresponding graph structure. It is particularly relevant to the user's difficulty getting insight from disconnected cards: a diagram and its explanation should be one coordinated surface. Copy the interaction pattern, not the assumption that generated relationships are reviewed facts.

**Material:** [authors' full paper](https://arxiv.org/html/2305.11473v2); [interface figure](https://arxiv.org/html/2305.11473v2/new-figures/g-interface.png); [abstract and publication metadata](https://arxiv.org/abs/2305.11473).

## Proposed direction for Vaulter

This is a recommendation to test, not an implementation decision or domain change. Vaulter already distinguishes a Subject, an unresolved Question, recorded Answer evidence, Wiki statements, and Citations retaining reviewed statement/source selections. A page reference describes provenance without asserting support. Citation support requires explicit review, and Wiki prose cannot serve as source evidence. [V1][V2]

Build **one investigation workspace** around “Understand this subject and trace its supporting sources”:

1. Start from a subject or question, with suggested recorded investigations rather than the entire vault.
2. Use a spatial canvas with readable statement labels and explicit directed relationship labels. Put questions, statements, and supporting passages in predictable regions; retain shared source nodes so the reader can see multiple branches converge.
3. Begin with a bounded neighborhood. Keep additional records behind counted groups such as “8 more statements” or “12 passages from this conversation.” Let the reader choose which relation to expand and collapse it again. Those numbers indicate hidden records, not importance.
4. Keep a source inspector beside the canvas. Selecting a citation opens the reviewed quotation, surrounding source context, original source link, and recorded/current status. Selecting a source highlights every visible statement citing it. Preserve the selected path while the reader reads.
5. Provide task-specific lenses for question/answer history, supporting passages, and shared sources. Make uncited statements or changed sources visible where relevant without converting them into confidence scores.
6. Preserve the working set: pin two branches for comparison, undo a view expansion, reset to the subject, and offer a readable text representation of the same selected relationships. A graph-only interface would make long statements and source reading unnecessarily difficult.

In the next prototype, vary **how the investigation works**, not just the arrangement of a topic's lists. Compare a focused question neighborhood against an explicit question–statement–passage lane layout using the same records. This keeps the design experiment small enough to learn from.

## Review tasks for the next prototype

Use the existing larger fixture and give the reader concrete tasks before asking whether the page looks good:

- Find the recorded evidence informing one open question and open its exact passage. Distinguish
  that context from a recorded Answer; the question remains open until answered or abandoned.
- Compare two statements that cite the same source; determine whether their passages are actually the same.
- Identify a statement whose reviewed source changed, then distinguish the reviewed quotation from current content.
- Follow a connection to another subject and return to the original investigation without losing the selected branches.
- Expand a group containing at least twenty records, isolate one relevant branch, and explain which records remain hidden.

Observe whether the reader can explain the recorded relationships correctly, how often they lose context, and whether they can complete these tasks without scanning every record. More dummy data alone cannot answer those questions.

## Sources

All external sources below were fetched on 2026-10-16. Obsidian's public pages serve a client bootstrap, so their first-party published Markdown content was also fetched from the page's own preload URL. Kumu's `.md` endpoints supplied the page content. No secondary product reviews were used.

- [O1] Obsidian, [Graph view](https://help.obsidian.md/plugins/graph), [published Markdown](https://publish-01.obsidian.md/access/f786db9fac45774fa4f0d8112e232d67/Plugins/Graph%20view.md).
- [O2] Obsidian, [Backlinks](https://help.obsidian.md/plugins/backlinks), [published Markdown](https://publish-01.obsidian.md/access/f786db9fac45774fa4f0d8112e232d67/Plugins/Backlinks.md).
- [N1] Neo4j, [Bloom search bar](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/search-bar/).
- [N2] Neo4j, [Bloom scene interactions](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/).
- [N3] Neo4j, [Bloom card list and inspector](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/card-list/).
- [K1] Kumu, [Focus](https://docs.kumu.io/guides/focus.md).
- [K2] Kumu, [Filter](https://docs.kumu.io/guides/filter.md).
- [K3] Kumu, [Views](https://docs.kumu.io/guides/views.md).
- [K4] Kumu, [Cluster](https://docs.kumu.io/guides/clustering.md).
- [D1] Discourse Graphs, [Base grammar](https://discoursegraphs.com/docs/obsidian/fundamentals/base-grammar).
- [D2] Discourse Graphs, [Canvas](https://discoursegraphs.com/docs/obsidian/core-features/canvas).
- [D3] Discourse Graphs, [Exploring your discourse graph](https://discoursegraphs.com/docs/obsidian/core-features/discourse-context).
- [T1] TheBrain, [official mobile help](https://help.thebrain.com/ipad/index.html).
- [G1] Jiang, Rayan, Dow, and Xia, [Graphologue: Exploring Large Language Model Responses with Interactive Diagrams](https://arxiv.org/html/2305.11473v2), UIST 2023, [DOI](https://doi.org/10.1145/3586183.3606737).
- [V1] Vaulter, [GLOSSARY.md](../../GLOSSARY.md).
- [V2] Vaulter, [ADR-0005: Retain citation selections in historical snapshots](../adr/0005-wiki-citation-selections.md).
