# Record embeds

A host owns placement and order. It retains a target with a `live` or `pinned` mode; omitted mode
in host admission means live. Both modes retain an integrity-validated historical reference.
For live presentation the reference anchors identity, while the selected state follows the latest
accepted transaction. Pinned presentation always selects the reference's exact transaction.

When reading a historical host, its reader supplies that host's transaction as a cutoff. Live
targets then resolve in that cutoff, including absence or removal, without falling back to current
data. Pinned targets remain at their explicitly selected state. References cannot currently admit
targets that were deleted in the selected reference state; retained deletion references remain a
separate contract.

Wiki admits embeds as ordinary Content with Appearance placement. Embeds contribute no text to
Wiki's citation projection. Conversation admits ordered Exchange attachments and displays them
after the first contribution belonging to that Exchange. Chat's ordinary restored transcript is
current reading; attachments do not become supplied Agent context or replay tool effects.

Application supplies target-owner presentation to both hosts. Questions and Map are installed;
`EmbeddedOwnerView` is the explicit composition seam for further owner views, receiving validated
identity and selected transaction. There is no module registry. Pinned and historical presentations
are read-only. The initial contract covers individual records; saved queries, collection embeds,
user-facing embed insertion controls and finer placement among Chat parts remain follow-up work.

Current host UI exposes `Embed a record` with Application-supplied Task, Question and Location
choices. Wiki appends the selected record after its current page content; Chat asks which Exchange
should own the attachment and defaults to the latest. Removing an embed removes its placement,
not its target. Live is the default, while pinning retains the state selected when choices were read.
Failed saves expose an exact retry and keep that control's choices disabled until acceptance.
