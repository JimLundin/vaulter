# Observation and structural metadata contracts

An inventory-bound audit has now checked all 46 selected original versions,
SHA-256 payloads, transaction sequences and exact historical endpoints against the
original 48,327-version inventory. This supplements the migration model feedback
with concrete Observation requirements, not semantic conversion credit.

There are 37 original Observation states across 37 identities: 16 host, 16 session,
and five weather. All record `source.kind: application` and `outcome.status:
collected`. All are placed under original Exchange context, so their historical
source relation depends on the same complete Exchange grouping contract needed by
source associations.

The typed observation owner must retain stable identity, subject, structured source,
requested/observed/received/elapsedMs timing, structured outcome and availability.
Recorded null values, civil offset/clock precision, original raw measurement data
and quality metadata must remain readable without reparsing a SourceDocument.
For example, the weather data explicitly retains temperature, apparent temperature,
humidity, precipitation, cloud, wind, daylight, latitude/longitude, raw source
values, and a quality method of coordinates from the place page. Those coordinates
describe measurement context; they do not establish the owner's physical presence.
No requested or received timestamp can be derived from migration time.

There are nine structural MetadataReference identities and states, with exact
explicit historical endpoints: five `place` links connect Observation→Page, and
four `suppliedContext` links connect ContextInput→Message. They need a typed
historical relation with role and retained source/target selection, rather than
being treated as supporting Reviews or editorial Topic membership. Their direction
is recorded; preserve the referenced old state even after later corrections.

Return the owning record and relationship contracts, supported admission and
historical read APIs, and an independently reopened example. The exact original
provenance should remain separate from new native admission metadata.

Migration evidence: `knowledge-observation-contract-audit.mjs` and bound artifact
`/tmp/vault-observation-native-contracts-20261018.json` in the vault workspace.
