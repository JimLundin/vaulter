# Vaulter response to vault migration feedback

See [the source-backed requests](vault-eav-feedback.md). This file is the return
handoff to the vault migration. Replace `pending` when a contract is agreed or
implemented; link the exact implementation commit and evidence.

A [contract and implementation-order proposal](vault-eav-contract-proposal.md)
is available for discussion. It uses the current module ownership layout and
identifies the historical deletion contract that must be resolved first. The
V01's product direction, a dedicated Tasks module with a Kanban board, and a
Decisions module with a global log and embedded views, and Observations records
with embedded presentation are agreed;
other requests and detailed field contracts
remain pending agreement. No implementation is claimed.

| Request | Status | Agreed contract / alternative | Owner and public interface | Implementation commit | Verification / remaining gaps |
| --- | --- | --- | --- | --- | --- |
| V01 Imported dialogue grouping | direction agreed; fields pending | Convert old dialogue into the ongoing Conversation. Preserve old notes as external sources, with original structure only for provenance/reference selection. Add no legacy grouping types to Conversation. | Sources owns preserved originals; private tooling owns conversion/correspondence; Conversation uses its current records. | pending | Original-container references must select source evidence rather than an arbitrary converted contribution. Source field/selection contract and reopened conversion examples remain pending. |
| V02 Recorded intentions and lifecycle | product basis agreed; fields pending | Tasks: fixed Backlog, Ready, In progress and Done columns; configurable boards/statuses deferred. Preserve original lifecycle provenance and optional civil due date; abandoned tasks remain accessible outside Done. Decisions: dedicated module, global list and embedded views; exact text, civil date, optional rationale and revision history without implied continued applicability. Observations: structured retained records and embedded presentation; no standalone measurements page initially. | Tasks, Decisions and Observations each own their records and presentation; Tasks owns board/lifecycle behavior. Detailed public interfaces pending. | pending | Tasks ordering, additional fields/views and cancellation interaction remain to settle. Detailed Observation value contracts pending. No implementation or source conversion claimed. |
| V03 Unresolved Relationships | product basis agreed; fields pending | Native incomplete relationships are candidates for clarification, including imported ones. Preserve known meaning, explicit gaps and external source provenance; no legacy-origin exclusion. | Graph owns candidate admission, clarification and reading; detailed interface pending. | pending | Preserve one identity through resolution/revision/removal. Do not infer endpoints/direction from placement. Source-association details and historical deletion reference contract remain pending. |
| V04 Cross-owner Containment / chronology | embedding direction agreed; detailed contracts pending | Cross-module embeds default to live data with explicit pinning to a recorded state. Applies beyond Wiki, including Chat with Tasks, Map locations and Questions. | Host owns placement/order; target owner supplies embedded views; Application composes foreign renderers. | pending | Historical live-result semantics, Query/chronology fixtures and retained placement contracts remain to settle. No implementation claimed. |
| V05 Published-journal conversion / references | scope resolved | Only the new migration is in scope. The previous one-time migration was for application testing and need not be reconciled or supported. | Private tooling owns new migration; Vaulter uses current native owners. | not applicable for old-journal reconciliation | Verify new migration independently. No old published data is deleted/overwritten by this decision; publication is separate. |
| V06 Spatial qualification | product basis agreed | Optional typed street qualification with meaningful display in Map and embedded location views. Other qualification values may be added later; measured accuracy stays separate. | Map owns CoordinateValue validation and presentation. | pending | Verify correction, historical reading and independent reopen. Other values deferred. |
| V07 Journal / historical-read performance | separate storage work | No model change. Indexes/caching/reduced repeated validation may improve historical read performance; outside current model work and migration acceptance criteria. | Core Store / Persistence implementation. | deferred | Measured optimization must preserve validation; not delegated as part of this model work. |
| V08 Uncaptured URL leads | product basis agreed | Sources lead retains URL, optional title and provenance without fabricated capture data. Later capture can create a linked SourceDocument. | Sources owns admission and reading. | pending | Exact historical state and independent reopen required; no evidence/support claim implied by URL alone. |
| V09 Unrecorded historical tool versions | pending | | | | |
| V10 Retained identity redirects | pending | | | | |

## Feedback to the migration

Record field-contract questions, migration assumptions that need correction,
branch/commit to inspect, and any proposed source-backed fixtures here. Keep
original source time distinct from conversion/admission time and identify
missing information explicitly.
