# Graph investigation comparisons

Question: which interaction helps a reader compare connected statements, questions and reviewed source passages without scanning the whole Vault?

Throwaway branch: `prototype/graph-ui-variants`. No design has been selected. The earlier topic briefing, evidence trail and source review alternatives are preserved at `3a6c3d0`; the original generic Graph layouts are at `506068d`.

The crashed session's final request was: “please give me variants based on this existing material”. This comparison continues that request using [the recovered research](../../docs/research/graph-ui-patterns.md).

| Variant | Material | Main interaction |
| --- | --- | --- |
| `inquiry` | Discourse Graphs + Neo4j Bloom | A bounded question/statement/source canvas; add individual branches, pin, hide, undo hide and inspect retained passages. |
| `local` | Obsidian local graph + TheBrain | Center one record, select neighbors, inspect recorded relationships, recenter and go back through focus history. |
| `linked` | Graphologue | Select a readable statement or source in the diagram; the diagram, reading list and evidence inspector share that selection. |

All use the same 14 topics, 105 statements, 29 cited sources and 24 questions. The Studio topic has twenty statements. Two additional fictional `informed-by` relationships give its open questions recorded context; they do not answer the questions. Application still supplies Wiki's resolved statements and historical citation selections. Source nodes aggregate an exact source address, while the inspector retains each statement's selected passage separately. No opposition or confidence score is inferred.

Use **Show more statements** to expand the view. In Inquiry, **Add a branch** keeps that statement visible; selecting a statement reveals pin and hide actions. **Changed or removed sources** and **Without citations** are lenses on recorded data. Local exploration starts from a question with recorded context and provides **Center this record** and **Back to previous focus**. Source passages link to other topics that cite the source. Changing topic starts a fresh investigation; pins and focus history are local to the current topic. Mobile uses a horizontally scrollable canvas and stacks the inspector. There is no free dragging, automatic layout optimization or saved investigation in this prototype.

Review tasks:

- Select the morning-work statement and compare its reviewed quotation with current source text.
- Add two statements citing the same source and inspect their individual selected passages.
- Follow an open question's context and explain why it is still open.
- Hide a branch, restore it, then expand the twenty-statement Studio topic.
- Compare diagram selection and reading-list selection in Linked reading.

Hosted entry:
<https://jimlundin.github.io/vaulter/preview/prototype/graph-ui-variants/?compare=graph&variant=inquiry#/graph/preview%3Agraph-topic/>

The existing preview pill cycles variants and retains the selected variant in the URL. Mobile constrains the same mounted app; Reset demo restores fictional records. Without `compare=graph`, the preview renders the current Application. Local command: `npm run design`, then use the same query and hash under `/preview/`.

Verdict: awaiting user review. These are design hypotheses adapted from documented interaction patterns, not claims of demonstrated usability. Promote a selected behavior through Graph and shared kit presentation, with the production verification required by the repository; retain this comparison separately.
