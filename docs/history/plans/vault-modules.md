# Existing modules for the vault migration

Status: proposed plan. Planning only; no application changes or migration performed.

Branch: `plan/vault-modules`; worktree: `/tmp/vaulter-vault-modules`.
Based on `feat/node-history` at `19418ca` plus its working changes captured in `39423b3`.

## Working thesis

Module-owned record UI is now an accepted direction in
[ADR 0006](../../adr/0006-module-ui-and-shared-presentation.md). Lists compose record UI that accepts
stored payload types or resolved projections; queries, synchronization and lifetime implementations
support rendering and interaction. Chat owns conversation interpretation, and History owns
transaction interpretation. Shared presentation belongs in the kit. The
[UI ownership plan](ui-module-ownership.md) defines its migration and enforcement; the remaining
record-reading work below retains its own scope.

## Scope

Focus first on **Chat and History**. Audit their interactions with the existing Agent module,
Vault storage and identity bootstrap. New Wiki, Graph, Calendar, Tasks, Questions, Decisions,
References and Identities workflows follow separately; they are not prerequisites for this phase.

The first delivery is a visible conversation list and a History feed containing every accepted
transaction in the vault, across all devices. Then complete imported-exchange presentation and
historical inspection. These lists read shared vault records, independently of device-local
conversation selection or which module authored a transaction. This phase does not establish
full migration readiness for all the shapes in [vault-records](../../specs/vault-records.md).

## What exists and what is missing

| Existing module | Present | Gap for this phase |
| --- | --- | --- |
| Chat | Node-backed submission, saved conversations/messages, metadata schemas, live text/voice and persistence recovery | Saved reads flatten exchanges; view conversion drops precision and version identity; exchange summaries, preambles, references and observations are not exposed by that projection |
| History | Paginated transactions, historical author/origin, changed-node labels, guarded content compensation | No detailed before/after inspection of content, placement or connections; no historical Chat navigation |
| Agent | Independent runs, effective inputs, tools, durable receipts and accepted-output projection | Preserve these contracts while Chat gains historical read views; no new execution functionality assumed |
| Vault | Snapshots, exact references, immutable history, GitHub persistence | Identify the historical import-time contract separately; no storage redesign assumed |
| Identity bootstrap | Stable owner/Agent identities and idempotent creation | Reuse historical attribution; creating a new Identities workflow is deferred |
| Product | Explicit Chat/History composition | Wire historical navigation and presentation callbacks without workflow-to-workflow imports |

The new Chat fields are already in the captured working changes: exchange precision/end/summary/
preamble, message precision, reference labels, nullable collection times and host/session subjects.
Audit their entire path before adding more types. A schema addition alone does not make the record
visible or ensure later writes preserve it.

## 1. Show the conversation list

Add a Chat-owned conversation-list component backed by `savedChats`, exposed through Chat's public
interface and assembled by Product. Show conversation title, last activity and selected state,
with actions to open a conversation and start a new one. Make the list accessible on phone and
desktop alongside the existing feed. Use vault identities for selection; localStorage remembers
selection only and never determines which conversations are listed.

The existing backend already exposes `chats()`, but there is no corresponding list view. Subscribe
to NodeStore changes and reread the list after synchronized remote updates as well as local writes.
Review `savedChats` activity ordering: it currently inspects only the last placed exchange and
ignores endedAt. Define activity from recorded event times with deterministic ties. Show loading,
empty, offline/stale and error states; one malformed conversation must not silently hide the list.
Opening a conversation must update retained selection, not only the openLatest/newChat paths.
Respect the controller's busy and pending-save restrictions and make blocked switching visible.

Acceptance:

- Conversations created on two devices appear in the same list after synchronization.
- Selecting any saved conversation opens its recorded messages and persists the selection.
- New conversations join the list after their initial acceptance; an empty draft is not a fabricated record.
- Remote updates refresh titles/activity without losing a draft or replaying execution.
- The list and new/open actions work on phone and desktop.

## 2. Show every transaction across devices

Make History reachable whenever the node store is available. Product currently gates navigation,
commands and Chat's History link on legacy `vault.history`; replace that condition with the node
history capability. Keep `NodeHistory` as the transaction-list renderer and verify that the
production session actually supplies and renders the shared node history.

List all accepted transactions, newest definitive sequence first, without a device, author,
conversation, scope or undo-eligibility filter. This includes identity bootstrap, Chat, Agent,
tool receipts, content operations, imports and compensation. Paginate until all history is
reachable; page size is a loading choice, not a total-history cap. Unknown well-formed operation
kinds remain visible. Undo eligibility affects the action, never whether a transaction appears.

Cross-device completeness requires refreshing authoritative GitHub history. Node subscriptions
notify readers after local acceptance or refresh; they are not a remote push channel. Keep session
ownership of synchronization, refresh on return/online, and add a visible refresh action plus
bounded periodic refresh while active. Coalesce refreshes and show last successful synchronization,
loading/offline/error state so cached history cannot be mistaken for fully current history.
Use that same refresh path for the conversation list. Do not add device records solely for this UI.

Preserve already-loaded pages when new transactions arrive. The current subscriber reload replaces
the list with its first page; reconcile by transaction ID/sequence instead, retaining the older
cursor and expanded entries. Guard against overlapping refresh/pagination responses, duplicates
and missing transactions.

Acceptance:

- Device A and B commit different operations; both History views show the same full sequence after refresh.
- Initial identity transactions, Agent/tool transactions and non-undoable transactions all appear.
- More than one page is reachable; new remote writes do not discard loaded older pages.
- History is available with node storage even when legacy file history is absent.
- Offline history stays readable and visibly stale; reconnect/refresh includes remote transactions.
- Tests use two independent adapters against fictional shared remote storage, not just one store's notifications.

## 3. Complete Chat's recorded read interface

Start in `app/workflows/chat/records/chat-store.ts`. Add an exchange-level projection at a selected
snapshot, containing the exact exchange version, ordered messages with their exact evidence,
references and Chat-owned metadata children. Reuse the accepted Agent-output projection.
Resolve every identity/exact endpoint against that same snapshot, including deleted or unavailable
content; retain labels for unresolved references.

Carry the projection through `node-backend.ts` and `node-conversation.ts` without discarding
precision, exchange grouping or evidence addresses. Keep the flattened message projection where
it serves model context, but derive it from the same read rules. Presentation metadata must not
silently become new provider instructions or conversation turns.

Acceptance:

- An imported conversation with several exchanges reads in placement order at current and older snapshots.
- Summary, preamble, precision, references and observations survive the projection unchanged.
- Exact evidence survives later edits/deletion; no read fabricates or executes an Agent run.
- Existing accepted-output and uncertain-tool projections keep their established meanings.

## 4. Render complete exchanges in Chat

Extend Chat's feed to show exchange summary and preamble, then its verbatim messages. Format time
at the recorded precision and expose exchange end time where useful. Show reference labels and
explicit unresolved/deleted states. Add observation presentation for existing subjects, including
host/session and weather, with known units, null collection times and source/quality details.
Product supplies optional navigation to foreign records; their modules need not exist yet.

Keep live streaming and recovery state distinct from historical recorded state. Audit terminal
response writes and metadata production for retention of optional fields and unknown JSON.
Imported messages need not have matching Agent runs or tool receipts.

Acceptance:

- Imported turns remain verbatim after reopen; preamble is displayed outside the turns.
- Precision and unknown collection times are displayed without inventing detail.
- Optional data does not disappear when a message receives a later version.
- Live text/voice, Stop, reopen and persistence-only retry retain their current behavior.

## 5. Add History before/after inspection

Extend `NodeHistory.tsx` beyond common labels. Inspect the actual before/after payload, placement
and connection for each changed node. Distinguish content changes, movement, retargeting, creation,
deletion and restoration. Generic inspection works for any JSON kind; Product can supply richer
Chat presentation through a small callback when useful.

Use the snapshot immediately before the transaction and the snapshot after it for composed views.
An exact node version does not freeze its children. Keep the existing historical author/origin
resolution and pagination. Unknown kinds remain inspectable through a generic fallback.

Acceptance:

- A transaction changing payload and structure reveals both changes.
- Historical authors retain their old names after identity edits.
- Before/after views do not accidentally resolve current children or targets.
- Mixed-kind transactions remain fully inspectable without new record workflows.

## 6. Connect History to read-only historical Chat

Product wires a History origin/change link to the corresponding conversation or exchange at the
selected transaction snapshot. Chat owns historical reading and presentation; History owns the
transaction view. Neither imports the other. Reuse a small address/cutoff navigation interface,
not a module registry or a universal renderer protocol.

Define historical selection explicitly in Chat state/routing. A historical view is read-only;
continuing a conversation is an explicit transition to its current snapshot, preserving the
existing draft/controller lifetime. Reopening a historical route never invokes provider execution.

Acceptance: selecting a Chat transaction opens the recorded exchange at its cutoff; later messages
and edits do not leak into the view; returning to current Chat preserves normal interaction.

## 7. Verify compensation and existing-module integration

Keep content compensation constrained by existing Product policies. Chat/Agent records remain
protected; this phase does not broaden undo to unimplemented lifecycle modules. Make unavailable
undo clear in History and preserve whole-transaction rejection and stale-version checks.

Use fictional imported records and multiple historical revisions to verify the entire path:
NodeStore → Chat projection → feed → History inspection → historical Chat. Run affected tests,
typecheck, lint, layout/composition checks and focused browser checks for these flows. Retain the
existing Agent recovery tests as regression coverage where the changed paths touch execution.

## Review decisions

- **Historical import time:** vault-records asks import transactions to retain original timestamps,
  while NodeCommit omits recordedAt and adapters assign acceptance time. Resolve this in the
  separate migration/storage plan. Chat's recorded event times can be presented now; History must
  label transaction acceptance time accurately. Changing that contract revisits ADR 0002/0003.
- **Kind naming:** new single-word lower-case naming conflicts with established agentRun,
  toolExecution, contextInput and metadataReference. Preserve existing kinds in this phase and
  resolve the spec wording before migration; do not rename them incidentally.
- **Unknown historical fields:** preserve the existing Chat/Agent JSON retention behavior. New
  view projections must not strip fields that a later write needs to retain.
- **Historical navigation:** settle the address/cutoff route and transition back to current Chat
  before implementation of step 6. Snapshot selection must be explicit, not inferred from a timestamp.

## Deferred work

Claiming provisional schemas into new workflows, page/block editing, Graph/lifecycle operations,
production tools for those modules, appearances, citation ranges and complete migration validation
are follow-up plans. Existing generic content tools remain until their replacements exist.

Deliver the conversation list and complete shared transaction feed first. Then improve exchange
rendering, before/after inspection and historical navigation. New record modules stay deferred.

## First implementation slice

Implemented on `refactor/conversations-history`, based on pushed main `40ece02`:
Chat now owns ConversationList/ConversationItem with saved-record selection; History owns
TransactionItem and retains loaded history pages after notifications. Product exposes History
from node storage; session refresh runs every 30 seconds while visible and has a manual action.
Two-device adapter tests and phone/desktop browser tests verify shared records and selection.
The remaining exchange-detail and historical-inspection steps are follow-up work.

## UI proposal workflow

Present variants and deploy a preview whenever proposing UI elements. Keep reusable selection,
layout and interaction primitives in the kit; keep conversation and transaction interpretation in
the owning modules. Record components accept stored payload fields as props, with resolved
structure, selection and callbacks supplied by their container. Rebased onto main's running
conversation UI; preserve its appearance while reconciling module ownership.

## Branch split

Preview deployment, preservation, reusable variant overrides and shared-node refresh/query changes
are on main. This branch is based on that work and contains the Chat/History UI design, sample
variants and presentation checks. The latest main migration tools and mobile-header changes remain.

## Iterative UI review

Tight grouped conversation spacing is selected. Retire discarded variants after each selection
and offer three new variants of the selected baseline. Current review varies header treatment
(strong rule, shaded band, editorial marker); group dates are not repeated on conversation rows.
