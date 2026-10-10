# Permanent chat metadata

Chat metadata uses the existing node/version/transaction model. Observations, agent runs, supplied
context, attachments, tool executions and interpretations are typed node payloads. The generic
store gains no metadata-specific tables or references. `chat-metadata.ts` defines the shapes and
`chat-metadata-schema.ts` validates feature ingress. Node references stay in structural connections.

A conversation contains exchanges. An exchange contains messages and metadata entries; each entry
can contain reference nodes with exact source/target addresses. New observations and corrections
create new identities. They do not version the message, exchange, conversation, or original
observation. All recorded history remains. Collection switches affect future collection only;
sign-out clears the rebuildable device cache and retains GitHub records.

## Collection and provenance

Every observation declares its subject, collector/provider name and version, requested time,
observed time, received time, and monotonic elapsed milliseconds. Observed time is when the value
actually describes the world. A cached geolocation fix retains the position's timestamp, even if
it predates submission. Environment responses retain provider time, interval and original JSON.
Reverse-geocoded addresses have no claimed observation time; their received time records when the
lookup completed. Coordinates and measurement units remain explicit. Accuracy is a measurement,
not a general confidence percentage. Weather/air quality are labelled estimates from provider grids.

Outcomes distinguish collected, disabled, unsupported, denied, unavailable, timed out and failed.
Unknown browser durations become null instead of Infinity; stationary speed stays zero. Browser
connectivity is an indication and never proves remote reachability. Missing optional values are
omitted without inventing measurements. Source collectors cannot change transaction attribution.

`browserObservationCollectors` supplies one-shot clock, app, device, display, connectivity, power,
location, address, weather and air-quality collectors. Location-derived services share one fix.
Disabling location prevents their position requests; each dependent collector records unavailable.
Browser APIs may request permission or be unavailable. Raw user-agent/client hints are observations,
not proof of a hardware identity. The installation identifier is supplied by the caller, allowing
an existing device identity to be connected structurally.

`collectObservations` starts all enabled collectors together and yields validated immutable records
in completion order. Each has a deadline; failures do not stop other collectors. Closing the stream
aborts outstanding service requests. Browser geolocation itself offers no cancellation handle;
a late callback cannot add an extra emitted record. Create a fresh collector set for each exchange.
No background location tracking or extra sensor permissions are started by this storage PR.

```ts
const collectors = browserObservationCollectors({
  installation,
  app: { feature: 'agent', entry: 'direct', build },
});
// Persist submission first. Optional metadata must not gate the agent request.
for await (const data of collectObservations(collectors)) {
  const transaction = crypto.randomUUID();
  const entry = {
    node: crypto.randomUUID(), order: nextOrder(), data,
    references: [{
      node: crypto.randomUUID(), order: 'a', target: submittedMessage.key,
      data: { kind: 'metadataReference', role: 'subject' },
    }],
  };
  // Keep transaction + entry unchanged for a retry if remote acceptance is uncertain.
  await recordChatMetadata(nodes, {
    transaction, recordedBy: writer, exchange, entries: [entry],
  });
}
```

The storage slice exports this collection/persistence interface; the existing chat controller
continues its legacy capture workflow until its migration. There is no new production collection
on unlock and no claim that metadata schema alone instruments provider/tool execution. Chat
migration supplies trusted user/system/agent attribution and records every submitted exchange,
not only messages the agent chooses to capture. That migration must retain pending metadata entries
on write failures so retries keep their original identity and values.

## Rich feature records

Message input records typed/dictated/pasted/imported/shared methods and transcription provenance.
A preserved transcript or later edit can be a separate exact referenced message. Attachments retain
name, media type, size, content hash, dimensions/duration and available embedded metadata. Actual
media content needs an attachment storage adapter; this PR does not silently store microphone audio.

Agent runs describe provider, requested/served model, settings, enabled tools/versions, request IDs,
start/end, finish/cancellation/error state, monotonic timing, usage and cost. Cost retains currency,
estimation flag and the source/time/rates used. Secrets, tokens and authorization headers never
belong in recorded settings or context. Workflows must supply sanitized effective configuration.

Context input nodes preserve the effective provider content, position, role, transformation and
selection. Exact reference nodes connect those inputs to the messages/documents/configurations
actually used. An observation collected after invocation is not retroactively supplied context.
Generated instructions, summaries and truncations retain their actual effective content. A vault
snapshot alone does not prove what the agent was given. References can also record on-screen
selection, attachments, run inputs/outputs and results. Tool executions retain call IDs, attempts,
input/output, elapsed time and outcomes; arbitrary JSON results are supported.

Interpretations record category, statement, time, method/version and whether the claim is explicit,
inferred or uncertain. The metadata writer requires exact evidence references. A correction is a
new interpretation with its evidence and a `corrects` reference to the original exact record.
Mentioned dates remain interpretation details, distinct from submission/observation timestamps.
The reader chooses current corrected interpretations without destroying historical beliefs.

The typed catalogue and runtime schema are extended together for additional collection such as
calendar context, air-quality details or supplied sensor data. Unknown nested raw provider JSON
is retained; known feature shapes are validated rather than relying on a free-form context bag.
