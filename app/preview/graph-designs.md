# Graph UI comparison

Question: how can Graph help someone understand a topic and trace its supporting sources?
These are throwaway alternatives on `prototype/graph-ui-variants`; no design has been selected.

All three use the real application shell and the same fictional Vault records. Application supplies
Wiki's resolved statements, citations and retained source passages. Wiki continues to own the citation
meaning and historical selections; the Graph screen presents an investigation across those records.
No Wiki data or citation parsing moves into Graph.

| Variant | Primary interaction | Layout |
| --- | --- | --- |
| `briefing` | Understand the topic | Statements paired with selected supporting passages and current source changes |
| `trail` | Trace a statement | Select a statement beside a visible Topic → Statement → Source passage trail |
| `review` | Assess the evidence | Citation coverage filters, retained quotations and current source text |

Hosted comparison:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=briefing#/graph/preview%3Agraph-topic/>

The comparison-only Studio routine scenario has three statements, two citations, one changed source
and one open question. The morning-work quotation remains intact while the source now describes a
different schedule. The proposed wall rack has no statement citation. Topic references are shown
separately from supporting passages; their count never becomes a confidence score.

Use the arrows in the existing preview pill to switch designs. The URL retains the variant for
sharing and reload. Mobile in the same pill compares the compact layout. Reset demo restores the
fictional records. Without `compare=graph`, the preview shows the current application unchanged.

Local command: `npm run design`, then open the same query and hash under `/preview/`.
No persistent server is needed for the hosted comparison.

Verdict: the original Canvas, Workbench and Atlas designs were rejected because inspecting adjacent
nodes did not reveal useful insight. Their source is retained at commit `506068d`. The revised
direction answers the user's selected task: understand a topic and trace its supporting sources.
The new variants await review. Promote the chosen behavior through the owning Graph workflow and kit;
retain this branch as the source for the alternatives.
