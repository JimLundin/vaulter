# Graph layout comparison

Question: which spacing refinements improve the preferred Obsidian baseline, Obsidian compact
and Communities blended layouts on desktop and phone?

Throwaway branch: `prototype/graph-ui-variants`. The previous round is preserved at `6046196`.
The user preferred both Obsidian alternatives and Communities blended. Those three anchors keep
their geometry and defaults here; two new variants isolate the remaining spacing decisions.
The first clustering round is preserved at `75901e9`, the refined baseline at `7c09fc0`, and the
rejected strict topic-area layouts at `6fd6425`.

| Variant | Relationship/grouping behavior | Node spacing | Canvas edges |
| --- | --- | --- | --- |
| `obsidian` | A: Preferred relationship-only baseline, unchanged. | Balanced | Adaptive 28–48px |
| `obsidian-dense` | B: Preferred compact Obsidian, unchanged. | Compact | 24px |
| `obsidian-snug` | C: Baseline forces with compact's edge clearance; isolates the margin choice. | Balanced | 24px |
| `communities-soft` | D: Preferred softly blended connection groups, unchanged. | Balanced | 24px |
| `communities-airy` | E: Same softly blended groups with longer springs and more breathing room. | Relaxed | Adaptive 28–48px |

A versus C isolates canvas margins. B versus C isolates compact versus balanced forces at the
same margin. C versus D isolates soft community attraction with the same spacing and margins.
D versus E explores opening the community layout while retaining its membership and cohesion.
The graph settings expose these choices independently so reviewers can mix them.

All five retain the same 172 records and 281 connections: 14 topics, 105 statements, 29 sources
and 24 questions. A shared source has one visible identity; its inspector retains each citation's
reviewed passage and separately exposes changed current source text. Fixture records are unchanged.

Connection communities use deterministic local modularity optimization on the full undirected
graph. Standard scale detects 28 groups in this sample. Both blended variants use exactly this
membership and soft group attraction (0.018); color, filtering and local focus do not recalculate
membership. Community scale remains independently selectable: fine favors smaller groups; broad
also merges whole connected groups when modularity improves, yielding six groups here. The broad
preset from the previous round is retained in its commit rather than this round's picker.

The shared map solver uses link springs, repulsion and collision spacing. Balanced forces use
factor 1, compact 0.6 and relaxed 1.65 for spring length and repulsion. Optional community attraction
pulls toward aspect-aware group regions. These remain soft forces, with every connection visible.
Relationship-only variants use zero group attraction. Node diameter continues to reflect total
incident connections; colors remain independent (Topic area, Record type or Connection count).

Canvas geometry adapts to measured width and height, fitting both axes. Tight edges reserve 24px;
balanced reserves an adaptive 28–48px. Generous 14% margins remain available in Settings. Every
choice adds mobile edge-rail clearance. Margins describe node centers. Sparse local views have
capped fit expansion. Zoom, normalized manual positions and viewport state survive resizing;
Reset positions restores the computed layout. Dragging does not continuously resimulate neighbors.

The main canvas, supporting-pane styling, native setting fields and mobile interaction guideline
are retained. Options, Fit, Graph view, filters and search share the phone edge rail. Settings and
Records occupy the same SupportingPane used by conversations/references, with a phone sheet.
Selection and dragging stay on the canvas. Focus reveals one or two steps with a disclosed
36-record limit; return to global preserves viewport state and population filters.

Review tasks:

1. Compare A and C for the amount of breathing room at the canvas edges.
2. Compare B and C for compact versus balanced branches with the same margins.
3. Compare C and D to judge whether subtle community attraction improves readability.
4. Compare D and E for more open community interiors and bridges.
5. Repeat on phone, focus a hub, inspect evidence and return to global.
6. Mix settings; Reset positions after manual dragging to compare automatic geometry.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=obsidian#/graph/>

Use the existing preview pill to switch all five variants and Mobile. Without `compare=graph`,
the preview remains current Application behavior. Local: `npm run design`, with the same query
and hash under `/preview/`.

Verdict: Obsidian baseline, Obsidian compact and Communities blended are the preferred anchors.
This round's spacing verdict is pending. This remains a prototype comparison on its feature branch.
