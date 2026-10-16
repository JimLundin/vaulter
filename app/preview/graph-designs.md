# Parent-topic graph configuration

Question: can tighter clusters based on actual parent topics preserve the preferred Obsidian map
while making overlaps between topics easier to see? Which settings should be the starting default?

Throwaway branch: `prototype/graph-ui-variants`. The user selected the relationship-only Obsidian
baseline and compact layouts, and then requested tighter grouping by the topic each record belongs
under, with UI configuration. Earlier spacing comparisons are preserved at `bff3210`, community
experiments at `6046196`, and strict broad-area layouts at `6fd6425`.

Starting default: **Parent topic / Tight cohesion / Compact within-topic spacing / Close topic
separation / Tight canvas edges**. Parent-topic color is the appearance default. This is a proposed
preview default for review, not production promotion.

| Variant | Configuration |
| --- | --- |
| `topic-tight` | A: Starting default. Tight topic cohesion, compact interiors and close centers. |
| `topic-balanced` | B: Gentle topic attraction and balanced interiors, with the same close centers. |
| `topic-separated` | C: Same tight interiors as A, with more space between topic centers. |
| `obsidian` | D: Preferred relationship-only baseline, retained for comparison. |
| `obsidian-dense` | E: Preferred relationship-only compact layout, retained for comparison. |

All five use the same 172 records and 281 connections: 14 topics, 105 statements, 29 sources and
24 questions. Fixture records and citations are unchanged.

Grouping is based on individual topic identity, rather than broad fictional metadata areas or
inferred connection communities. Each statement/question belongs to its projected parent topic;
the topic node is part of its own cluster. Sources belong to every topic whose statements cite
them. Their membership is collected from all citations before filtering, so the first encountered
citation does not assign a source to an arbitrary topic. Each source remains one node with its
full connection count. The inspector explicitly lists its citing topics and preserves the reviewed
passage/current source text distinction.

The caller supplies these memberships to the shared kit. Its coarse spring layout uses connections
between groups to place related topic centers near each other. Individual records settle with
repulsion, collisions and edge springs plus attraction to their topic centers. A multi-topic source
feels the average attraction of its memberships; its actual citation springs pull toward the cited
neighbors, letting it sit near the shared border. There are no hard boxes, duplicate source nodes
or fixed geographic topic slots.

Settings starts with Layout, followed by Appearance and visible-record filters. Group by selects
Parent topic or Relationships only. Topic separation selects Close (0.65), Balanced (0.85) or Open
(1.15); cohesion selects Gentle (0.018), Tight (0.065) or Very tight (0.22). Within-topic spacing
selects Compact (0.6), Balanced (1) or Relaxed (1.65) spring/repulsion factors. Canvas edges selects
24px, adaptive 28–48px or generous 14% margins, always reserving mobile rail clearance. Use default
layout restores the starting settings. Dragged nodes remain pinned until Reset positions clears
them. Configuration and manual positions remain in memory, resetting on variant switch/reload.

Color defaults to individual parent topics, with a distinct shared-source color for sources cited
from several topics. Other choices remain Topic area, Record type and Connection count. Color does
not change memberships or layout forces; the canvas adapts if the legend changes its available
height. Node sizes retain total incident connection counts. On desktop the legend
shows each topic title; compact legends with more than six colors show the count and direct the
reader to record details to preserve the canvas height.

The graph remains the main workspace, and supporting content uses the same SupportingPane as
conversations and references. The mobile edge rail retains Fit, Graph view, filters, search and
options. Options opens the same phone supporting sheet; selection and dragging stay on the canvas.
Zoom and normalized manual positions survive resizing; SVG links and node controls share coordinates.
Local focus retains its one/two-step exploration and disclosed 36-record limit. Return to global
preserves viewport state and filters.

Review tasks:

1. Compare A with D/E to judge whether parent-topic clustering improves the Obsidian layout.
2. Find a shared-source node near the boundary of different topic colors; inspect its citing topics.
3. Compare A/B for tighter versus gentle interiors and A/C for topic-center separation.
4. Mix Settings; use the default-layout button to return to the starting configuration.
5. Repeat on phone, zoom/drag, focus a topic, inspect citation evidence and return to global.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=topic-tight#/graph/>

The existing preview pill switches variants and Mobile. Without `compare=graph`, the preview
continues to show current Application behavior. Local: `npm run design`, with the same query and
hash under `/preview/`.

Verdict: the Obsidian style is preferred; grouping should follow actual parent topics and remain
configurable. The tighter starting configuration above is available for review.
