# Global-to-local Graph comparison

Question: how should someone discover populations in the whole Vault and narrow into a local graph, on desktop and mobile?

Three throwaway alternatives on `prototype/graph-ui-variants`, using the same sample records and the real Application shell. No design has been selected. The prior inquiry canvas, local explorer and linked-reading designs are preserved at `839aeac`; earlier designs and research are at `3a6c3d0`.

| Variant | Structure | Main way to narrow |
| --- | --- | --- |
| `map` | One large spatial map | Filter populations, zoom, inspect a record, then focus its neighborhood. |
| `atlas` | Four named area summaries, then an area map | Choose an area, then a topic or another record, with a back trail. |
| `navigator` | Map beside a searchable index | Search or select a record; retain an area overview while exploring locally. The map precedes the index on mobile. |

The sample has 172 displayed records: 14 topics, 105 statements, 29 sources and 24 open questions. Connections include derived containment, reviewed statement citations and recorded topic/question relationships. Source identities remain shared across citing topics; their inspector retains each citation's exact reviewed passage separately.

At overview scale, the map shows area names and colored populations. Topics are selectable; zoom reveals individual record controls and topic labels. Local views support one or two steps, with a disclosed 36-record display limit. The selected local root remains visible when its population is filtered out. Returning to Whole Vault restores that map's zoom and scroll position, retaining population filters. State is in memory and resets on reload or variant change.

Areas use the fictional topics' recorded Studio, Garden, Learning and Routine categories, with matching presentation categories for the older sample pages. Positions are illustrative deterministic geometry, not detected communities or evidence of importance. Source placement follows its first citing topic, while connections disclose reuse elsewhere. The Atlas's cross-area lines summarize the underlying connections; they do not add new Vault relationships.

Mobile uses the same mounted graph with explicit zoom controls, native scrolling/swiping in the detailed canvas, and the shared bottom Drawer for inspection. Desktop also supports dragging the detailed canvas. Graph pinch-to-zoom is not implemented in this prototype. Selecting a record shows its text, direct relationships and a Focus neighborhood action; statement/source inspection retains changed and removed source notices. An open question's context does not count as an Answer.

Review tasks:

1. Start globally and find an area of interest without reading every record.
2. Toggle Sources or Questions and explain which population remains visible.
3. Open Studio routine, focus its immediate neighbors, and expand two steps.
4. Inspect the morning-work statement and distinguish reviewed evidence from current source text.
5. Return globally and confirm the map position and population filters are retained.
6. Repeat on mobile, using tap, zoom, swipe and the inspector sheet.

Hosted comparison:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=map#/graph/>

Switch alternatives with the existing preview pill; its Mobile control preserves the mounted graph state. Without `compare=graph`, the default preview renders the current Application. Local command: `npm run design`, then open the same query and hash under `/preview/`.

Verdict: awaiting user review. The accepted direction is global overview → local neighborhood → inspection; these variants compare how to move between those levels. They are read-only design experiments, not production implementations or performance benchmarks. Preserve this branch as the comparison source when promoting a selected design.
