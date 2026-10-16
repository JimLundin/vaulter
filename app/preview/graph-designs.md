# Parent-topic graph configuration

Question: can tighter clusters based on actual parent topics preserve the preferred Obsidian map
while making overlaps between topics easier to see? Which settings should be the starting default?

Throwaway branch: `prototype/graph-ui-variants`. The user selected the relationship-only Obsidian
baseline and compact layouts, and then requested tighter grouping by the topic each record belongs
under, with UI configuration. Earlier spacing comparisons are preserved at `bff3210`, community
experiments at `6046196`, and strict broad-area layouts at `6fd6425`.

The user preferred Topics gentle and Obsidian compact in the parent-topic round (`98c80ca`).
This comparison keeps those two anchors and adds a middle setting.

Starting default: **Parent topic / Subtle cohesion / Compact within-topic spacing / Close topic
separation / Tight canvas edges**. Parent-topic color remains the appearance default.

| Variant | Configuration |
| --- | --- |
| `topic-middle` | A: Compact blend. Obsidian compact spacing with subtle parent-topic attraction (0.009). |
| `topic-balanced` | B: Preferred Topics gentle, unchanged: gentle attraction (0.018), balanced spacing. |
| `obsidian-dense` | C: Preferred Obsidian compact, unchanged: zero attraction, compact spacing. |

The middle setting uses half the gentle attraction and the compact spacing from Obsidian. It
nudges records toward their actual parent topics without imposing the tighter clusters from the
previous round. Subtle is now available in Group cohesion, and Use default layout restores it.
All three retain the same 172 records and 281 connections. Earlier configurations remain in their
commits and can also be recreated through Settings.

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
(1.15); cohesion selects Subtle (0.009), Gentle (0.018), Tight (0.065) or Very tight (0.22). Within-topic spacing
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

1. Compare the compact blend with Topics gentle and Obsidian compact on desktop and phone.
2. Inspect a shared source between topics and confirm its citing topics.
3. Adjust cohesion and spacing independently, then restore the default layout.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=topic-middle#/graph/>

The existing preview pill switches variants and Mobile. Without `compare=graph`, the preview
continues to show current Application behavior. Local: `npm run design`, with the same query and
hash under `/preview/`.

Verdict: the Obsidian style is preferred; grouping should follow actual parent topics and remain
configurable. Topics gentle and Obsidian compact are the latest favorites; the subtle compact
blend above is the proposed middle setting for review.
