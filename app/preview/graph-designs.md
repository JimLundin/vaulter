# Graph layout comparison

Question: how should clustering, node spacing and canvas-edge clearance change the preferred
Obsidian baseline on desktop and phone?

Throwaway branch: `prototype/graph-ui-variants`. The preferred baseline with the refined settings
pane and adaptive canvas is preserved at `7c09fc0`. The earlier local spotlight and persistent
index comparison is available at that commit; this round replaces the picker with layout options.
The rejected strict area layouts are preserved at `6fd6425`.

| Variant | Grouping and behavior | Spacing | Canvas edges |
| --- | --- | --- | --- |
| `obsidian` | A: Links and repulsion only; the accepted baseline. | Balanced | Adaptive 28–48px |
| `open` | B: Links only, with longer springs and more repulsion; open relationship branches. | Relaxed | 14% of each axis |
| `communities` | C: Dense connection communities detected from the full graph; medium attraction toward group regions, with bridges retained. | Balanced | 24px |
| `soft` | D: Topic areas exert a weak attraction; relationships can stretch across the regions. | Relaxed | 24px |
| `islands` | E: Strong topic-area attraction and short springs create more distinct islands; all inter-area links remain visible. | Compact | 14% of each axis |

All five use the same 172 records and 281 connections: 14 topics, 105 statements, 29 sources and
24 questions. Connections include derived containment, citations and recorded topic/question
relationships. A shared source has one visible identity and retains each citation's reviewed
passage in its inspector. The morning-work statement still exposes the recorded passage and
current source text separately.

The Settings tab provides independent Group by, Group cohesion, Node spacing and Canvas edges
controls, so reviewers can mix parts of the presets. The workspace shows the current grouping,
spacing and edge setting. Group cohesion appears only when grouping is enabled. These choices
remain in memory; variant switching mounts a fresh preset. Colors are independent: Topic area
(default), Record type or Connection count. Node diameter always reflects the square root of full
incident connection count, capped visually. Neither color nor selection changes automatic geometry.

Connection communities use deterministic local modularity optimization over the full undirected
connection graph, counting parallel relationships as weight. Thirty passes is the bound; the
algorithm stops when membership stabilizes. This is a prototype community heuristic, not a claim
that the groups are semantic topics. Color, population filters and local focus do not recalculate
membership. Topic-area grouping uses the fictional page metadata; shared sources form Shared.

The shared map solver accepts the owner's group assignments. Optional attraction pulls toward
regions arranged for the current canvas aspect ratio. Repulsion, collision clearance and edge
springs remain active in every preset. Groups are soft forces rather than containment boxes;
records can cross regions and links never disappear because of grouping. Strong islands emphasize
separation at the expense of longer cross-group bridges. The relationship-only presets apply zero
group attraction.

The solver adapts to the measured canvas and fits both axes. Tight margins reserve 24px; balanced
reserves 28–48px; generous reserves 14% per axis with a 28px minimum. Every configuration adds
36px of clearance beside the mobile rail. These are node-center margins, not label bounding boxes.
Sparse local graphs have a capped fit expansion. Zoom magnifies the fitted canvas and keeps the
viewport center. Manually dragged nodes retain normalized positions across resizing and option
changes; Reset positions restores the full computed layout. The settled simulation does not run
continuously during dragging. Pinch zoom remains outside this preview.

The graph fills the main workspace. Settings, Records and inspection use the existing SupportingPane
from conversations and references, with its full-height phone sheet. Fit, Graph view (zoom/reset),
filters, search and options use the mobile edge rail. Node selection and dragging stay on the
canvas. Desktop options joins Fit/zoom/reset in the same row. Narrow fields stack their label,
full-width control and description. Population filters retain aligned checkbox rows with counts.

Baseline-style local browsing is shared across all five: select a record, inspect, then Focus
neighborhood. One or two connection steps are available, with a disclosed 36-record local limit.
Focus clears text search to reveal the neighborhood. Population filters remain active; returning
to global retains its viewport. Records search and native color controls still work.

Review tasks:

1. Switch through all five on desktop and phone with the same records visible.
2. Compare hub readability, long bridges and the blank space around the graph.
3. Compare connection communities with topic colors: different meanings can overlap.
4. Mix Group by, cohesion, node spacing and edge margins in Settings.
5. Drag a node, change options, then Reset positions to judge the full automatic layout.
6. Focus a hub locally, inspect citation evidence and return to global.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=obsidian#/graph/>

The existing preview pill switches all five variants and Mobile. Without `compare=graph`, the
preview remains current Application behavior. Local: `npm run design`, then the same query and
hash under `/preview/`.

Verdict pending for this round. The earlier Obsidian preference remains the baseline. No production
promotion or merge is implied by this preview comparison.
