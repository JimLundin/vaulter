# Relationship-shaped Graph comparison

Question: can an Obsidian-style graph provide a useful starting point for Vaulter, with layout shaped by relationships, selectable color meaning, size by connection count, and the graph occupying the main workspace?

Throwaway branch: `prototype/graph-ui-variants`. The named-area layouts are preserved at `6fd6425`; earlier investigation designs are at `839aeac`. The user prefers the Obsidian baseline as the direction for implementation. Alternatives remain available for comparison while the preview is refined.

| Variant | Structure | Interaction |
| --- | --- | --- |
| `obsidian` | A large relationship-shaped global graph | Hover or select to trace links, drag nodes, filter populations, zoom, inspect and focus locally. |
| `spotlight` | The same global graph with a local lens | Focus a record to highlight its neighborhood while retaining the remaining graph as faint context. |
| `navigator` | Graph with a persistent shared supporting pane | Find a record by text or type, inspect it, and focus its local graph. Map comes first on mobile. |

All alternatives share 172 records: 14 topics, 105 statements, 29 sources and 24 questions. The 281 connections include derived containment, citations, and recorded topic/question relationships. A shared source remains one visible identity; its inspector presents each citation's reviewed passage separately.

The map uses a deterministic spring-and-repulsion simulation with collision spacing and a weak central attraction. It reads node identities, connection counts and edges, without category centers or geographic regions. Link patterns therefore shape the initial layout. The simulation settles before presentation; manual dragging moves a node and its lines without continuously resimulating its neighbors. Reset positions restores the computed layout.

Color defaults to topic area, derived from the fictional pages’ metadata. Sources cited across areas are Shared. Graph options switches between Topic area, Record type and Connection count (0–2, 3–7, 8+). Colors do not affect the solver, manual positions, zoom or local focus. Node diameter grows with the square root of its full incident relationship count, with a visual maximum; incoming and outgoing connections contribute, including parallel relationships. A larger node indicates more connections, not stronger support or importance. Counts and sizes retain their whole-sample meaning when filters or local views hide connections. Compact fit views reduce all diameters proportionally; zoom reveals full-size controls and more selectable records.

The type filters remove populations. The baseline and index variants focus to a local subgraph; Local spotlight retains the global layout and dims records outside the chosen neighborhood. Local views use one or two steps and a disclosed 36-record limit. Return to global preserves its zoom and pan position and the population filters. Node positions and navigation state remain in memory; changing variant or reloading resets them.

On mobile, page interaction follows the shared edge-rail guideline. Fit map has a direct rail control;
Graph view opens zoom and reset actions inward. Filters opens independent checked population choices,
and Search opens the rail’s field and narrows the graph by record text. Graph options opens color
configuration and local navigation in the shared supporting pane. Focus clears the text search to
reveal the neighborhood. Node selection and dragging remain direct canvas interactions. Desktop
retains inline map controls and supporting-pane filters and search.

Graph options separates Settings from Records with tabs. Settings groups Appearance, visible populations and layout information; record search and inspection retain their own space. Narrow setting fields stack their label, full-width control and description according to their container width. Desktop population filters use aligned checkbox rows with counts.

Graph options sits beside Fit map, zoom and reset in the desktop map-control row. On mobile,
these controls share the edge rail, with settings opening the same supporting pane.

The graph fills the available workspace below a compact toolbar. Filters, search and inspection use the same right-hand SupportingPane as Wiki references and conversations, with a full-height bottom sheet on phones. The navigator variant keeps this pane visible on desktop; the baseline and spotlight open it on demand.

On desktop, hover highlights incident links and reveals labels. Nodes support dragging; the detailed canvas supports drag or scroll. On phones, tap opens the shared bottom inspector, explicit zoom reveals smaller records, and blank canvas areas support native swiping. Node drag also works through pointer input. Graph pinch zoom is not implemented. The solver adapts to measured canvas dimensions, including opening or closing the supporting pane. Gravity and link spacing respond to its proportions; the settled graph fits both axes with padding and compact rail clearance. Nodes stay circular, with incoming and outgoing connections still determining size. Zoom and manual node positions are retained across resizing. SVG links and node controls share normalized coordinates.

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

Verdict: the Obsidian baseline is the user's preferred direction. Relationships shape the map;
selectable colors and connection counts reveal its populations and node sizes. The graph fills the
workspace, supporting content uses the shared pane, and mobile page controls use the edge rail.
Graph options joins the desktop map-control row. This remains a preview; retain the branch as the
comparison source when implementing the selected production design.
