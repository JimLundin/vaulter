# Observations

Observations owns retained structured host, session and weather measurements and collection outcomes.
It exposes transactional admission, revision, removal and pinned historical reading through
`index.ts`, and `EmbeddedObservation` through `presentation/index.ts`. There is no module route.
Application installs `observationEntities` in its composed database; callers supply the owner's
reading to embedded presentation. A fictional embedded example is on `/preview/records.html`.

The subject discriminant describes what was collected. Optional historical `context` associates
an existing recorded native identity; optional `provenance` selects preserved external source
material. Neither creates legacy Conversation containers or asserts a person's location. Source
metadata, raw payload, quality, collection outcome and timing belong to the structured record.
Admission metadata stays in the enclosing Transaction and never becomes original collection time.

Missing JSON keys remain absent; explicitly recorded nulls remain null. Offset timestamp strings
retain their exact text and minute/second/fractional precision. No requested, received or completion
time is inferred. Host/session/weather known measurement fields are validated; additional original
measurement/source keys and raw JSON are retained. Unsupported subject and outcome shapes fail
admission and reading explicitly rather than being silently discarded.

Removal changes availability without erasing final values. `readObservations` normally selects
available current records; `includeUnavailable` exposes retained removed values and `snapshot`
selects an exact accepted state. Context filtering matches identity across source revisions.
Existing Store historical references validate a live selected target; selecting a state already
deleted at its snapshot awaits the separate retained-state reference contract. Structural `place`
relations and source-to-native conversion correspondence are separate owner contracts.

This capability has not converted or verified the private source inventory. Focused tests exercise
independent durable reopening, corrections/removal, historical provenance after source deletion,
missing values and atomic rejected admission.
