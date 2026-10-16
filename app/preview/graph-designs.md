# Graph layout comparison

Question: which refinements of the preferred Obsidian baseline and connection communities
work best on desktop and phone?

Throwaway branch: `prototype/graph-ui-variants`. The preferred baseline with the refined settings
pane and adaptive canvas is preserved at `7c09fc0`. The earlier local spotlight and persistent
index comparison is available at that commit; this round replaces the picker with layout options.
The rejected strict area layouts are preserved at `6fd6425`.

The user selected Obsidian baseline and Connection communities as the strongest directions in the
first layout round (`75901e9`). Both are retained unchanged here. The other three presets refine
those directions; the previous topic-group and open-layout alternatives remain in that commit.

| Variant | Grouping and behavior | Spacing | Canvas edges |
| --- | --- | --- | --- |
| `obsidian` | A: Original preferred relationship-only baseline. | Balanced | Adaptive 28–48px |
| `obsidian-dense` | B: Relationship-only baseline with shorter springs; compare denser branches and closer edges. | Compact | 24px |
| `communities` | C: Original preferred connection communities; standard scale and medium attraction. | Balanced | 24px |
| `communities-soft` | D: Same communities with soft attraction; groups blend while relationships pull bridges together. | Balanced | 24px |
| `communities-broad` | E: Broader connection groups, soft attraction and longer springs; emphasize larger neighborhoods. | Relaxed | Adaptive 28–48px |

All five use the same 172 records and 281 connections: 14 topics, 105 statements, 29 sources and
24 questions. Connections include derived containment, citations and recorded topic/question
relationships. A shared source has one visible identity and retains each citation's reviewed
passage in its inspector. The morning-work statement still exposes the recorded passage and
current source text separately.

The Settings tab provides independent Group by, Group cohesion, Node spacing and Canvas edges
controls, plus Community scale for connection grouping, so reviewers can mix parts of the presets. The workspace shows the current grouping,
spacing and edge setting. Group cohesion appears only when grouping is enabled. These choices
remain in memory; variant switching mounts a fresh preset. Colors are independent: Topic area
(default), Record type or Connection count. Node diameter always reflects the square root of full
incident connection count, capped visually. Neither color nor selection changes automatic geometry.

Connection communities use deterministic local modularity optimization over the full undirected
connection graph, counting parallel relationships as weight. Thirty passes is the bound; the
algorithm stops when membership stabilizes. Community scale changes modularity resolution: fine 1.6, standard 1.0 and broad 0.4. Broad encourages larger groups; cohesion separately controls their attraction in the layout. This is a prototype community heuristic, not a claim
that the groups are semantic topics. Color, population filters and local focus do not recalculate
membership. Broad scale also greedily merges whole connected communities when the modularity gain
is positive, overcoming local node-move plateaus. Standard keeps the previously preferred grouping
unchanged. In this fixture, standard detects 28 groups and broad merges them to six. Topic-area grouping uses the fictional page metadata; shared sources form Shared.

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

Verdict: Obsidian baseline and Connection communities were the favorites from the previous round. Verdict pending for these refinements. No production
promotion or merge is implied by this preview comparison.
