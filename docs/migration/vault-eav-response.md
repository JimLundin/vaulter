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
| V03 Unresolved Relationships | pending | | | | |
| V04 Cross-owner Containment / chronology | pending | | | | |
| V05 Published-journal conversion / references | pending | | | | |
| V06 Spatial qualification | pending | | | | |
| V07 Journal / historical-read performance | pending | | | | |
| V08 Uncaptured URL leads | pending | | | | |
| V09 Unrecorded historical tool versions | pending | | | | |
| V10 Retained identity redirects | pending | | | | |

## Feedback to the migration

Record field-contract questions, migration assumptions that need correction,
branch/commit to inspect, and any proposed source-backed fixtures here. Keep
original source time distinct from conversion/admission time and identify
missing information explicitly.
