# Graph design selection

The user selected **Topics gentle** for production after comparing Obsidian layouts, connection
communities and parent-topic configurations. The selected comparison is preserved on
`prototype/graph-ui-variants` at `5cc7a83`. Earlier experiments remain on that branch; the default
preview now renders the production Application.

Selected defaults: **Parent topic / Gentle cohesion (0.018) / Balanced within-topic spacing /
Close topic separation (0.65) / Tight canvas edges (24px)**. Parent-topic coloring is the default.

Each topic has its own color and attracts its statements and questions. A shared source remains
one node, belongs to every citing topic, and uses pink. Relationships position topic centers and
pull shared sources toward their citing neighbors, making overlaps visible near topic borders.
Node sizes represent total incident connections before filtering.

Layout controls allow relationship-only grouping, four cohesion strengths, three internal spacing
levels, three topic separation levels and three canvas margins. Color can represent parent topic,
metadata area, record type or connection count without changing layout membership. Reset defaults
restores Topics gentle. Manual positions and settings remain in memory until reload.

The adaptive map occupies the main workspace. Settings, records, vocabulary and source inspection
use the existing SupportingPane. On mobile, search, filters, fit and graph options use the edge
rail. Node selection and dragging remain on the canvas. Local focus offers one or two steps and
discloses its 36-record limit; the global map retains the complete filtered collection.

Graph keeps recorded relationships, unresolved and deleted endpoint states, exact-version context
and reviewed citation passages inspectable. Application supplies owner projections; Graph does
not import another workflow. The production entry uses the same GraphPage as the neutral preview.

Preserved comparison:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=topic-balanced#/graph/>
