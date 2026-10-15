# Graph UI comparison

Question: which information hierarchy makes exploring a subject's connections feel useful?
These are throwaway alternatives on `prototype/graph-ui-variants`; no design has been selected.

All three use the real application shell, Graph reading and the same fictional Vault records.
Subject selection, source links, search, direction filters and Vocabulary remain interactive.

| Variant | Primary interaction | Layout |
| --- | --- | --- |
| `canvas` | Follow connected nodes | Large network first, subject browser and relationship lists below |
| `workbench` | Choose a subject and inspect it | Subject browser beside an inspector containing the network and connection details |
| `atlas` | Browse meaningful relationships | Connected subject cards grouped by relationship, with a separate Vault browser |

Hosted comparison:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=canvas#/graph/preview%3Apage%3A0/>

Use the arrows in the existing preview pill to switch designs. The URL retains the variant for
sharing and reload. Mobile in the same pill compares the compact layout. Reset demo restores the
fictional records. Without `compare=graph`, the preview shows the current application unchanged.

Local command: `npm run design`, then open the same query and hash under `/preview/`.
No persistent server is needed for the hosted comparison.

Verdict: awaiting review. Promote the chosen behavior through the owning Graph workflow and kit;
retain this branch as the source for the alternatives.
