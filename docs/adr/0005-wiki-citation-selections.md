# Retain citation selections in historical snapshots

Wiki citations retain validated historical references and nonempty half-open UTF-16 ranges for
both assertion and source passage. Independently edited children resolve in the selected snapshot;
recording only a container identity would allow later edits to change reviewed evidence.

Projection formats are explicit: `wiki-text-utf16-v1`, `wiki-summary-utf16-v1` and
`source-text-utf16-v1`. Inline fragments concatenate verbatim, blocks use newlines and table cells
use tabs. Structural references contribute no text and ranges cannot split surrogate pairs.
Changed projection semantics require a new format. Integrity establishes existence; support requires
an explicit attributed review of the selected assertion. Changed selected text requires review again.

Page references describe page-wide provenance without supporting any particular statement.
Citations and provenance point to retained conversations, reports or independently captured source
material. Wiki pages and their content remain navigation and retrieval targets; their prose cannot
corroborate itself. Eligibility is evaluated in the source's historical snapshot. Later edits or
removal preserve the original reviewed passage and disagreement may coexist with support.
