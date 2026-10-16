# Relationship-shaped Graph comparison

Question: can an Obsidian-style graph provide a useful starting point for Vaulter, with layout shaped by relationships, color by record type, and size by connection count?

Throwaway branch: `prototype/graph-ui-variants`. The named-area layouts are preserved at `6fd6425`; earlier investigation designs are at `839aeac`. No production design has been selected.

| Variant | Structure | Interaction |
| --- | --- | --- |
| `obsidian` | A large relationship-shaped global graph | Hover or select to trace links, drag nodes, filter populations, zoom, inspect and focus locally. |
| `spotlight` | The same global graph with a local lens | Focus a record to highlight its neighborhood while retaining the remaining graph as faint context. |
| `navigator` | Graph beside a searchable index | Find a record by text or type, inspect it, and focus its local graph. Map comes first on mobile. |

All alternatives share 172 records: 14 topics, 105 statements, 29 sources and 24 questions. The 281 connections include derived containment, citations, and recorded topic/question relationships. A shared source remains one visible identity; its inspector presents each citation's reviewed passage separately.

The map uses a deterministic spring-and-repulsion simulation with collision spacing and a weak central attraction. It reads node identities, connection counts and edges, without category centers or geographic regions. Link patterns therefore shape the initial layout. The simulation settles before presentation; manual dragging moves a node and its lines without continuously resimulating its neighbors. Reset positions restores the computed layout.

Color distinguishes topics, statements, sources and questions. Node diameter grows with the square root of its full incident relationship count, with a visual maximum; incoming and outgoing connections contribute, including parallel relationships. A larger node indicates more connections, not stronger support or importance. Counts and sizes retain their whole-sample meaning when filters or local views hide connections. Compact fit views reduce all diameters proportionally; zoom reveals full-size controls and more selectable records.

The type filters remove populations. The baseline and index variants focus to a local subgraph; Local spotlight retains the global layout and dims records outside the chosen neighborhood. Local views use one or two steps and a disclosed 36-record limit. Return to global preserves its zoom and pan position and the population filters. Node positions and navigation state remain in memory; changing variant or reloading resets them.

On desktop, hover highlights incident links and reveals labels. Nodes support dragging; the detailed canvas supports drag or scroll. On phones, tap opens the shared bottom inspector, explicit zoom reveals smaller records, and blank canvas areas support native swiping. Node drag also works through pointer input. Graph pinch zoom is not implemented. The renderer preserves layout proportions across viewport sizes.

Review tasks:

1. Find a large topic or shared-source hub and inspect its connection count.
2. Hover or select it and follow its highlighted links.
3. Drag a record, then restore its computed position.
4. Focus a topic and compare isolated local browsing with the spotlight retaining global context.
5. Inspect the morning-work statement's retained passage and current source text.
6. Repeat on mobile and return to the global map with filters retained.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=obsidian#/graph/>

Use the existing preview pill to switch variants or constrain the same mounted app to Mobile. Without `compare=graph`, the preview renders current Application behavior. Local command: `npm run design`, then use the same query and hash under `/preview/`.

Verdict: awaiting user review. The accepted correction is to let relationships shape the map and use color and connection counts for populations and node sizes. This adapts an Obsidian-style interaction pattern; it is not a complete clone or a performance benchmark. Retain the branch as the comparison source when implementing a selected production design.
