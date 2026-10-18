# Adopt Edge Rail in Vaulter

Assessment date: 2026-10-18.

Target: [vault-of-glass / Edge Rail](https://github.com/JimLundin/vault-of-glass),
commit `fdfa4cd693c032fb3b2177b35a1527adbdd4e789` (v0.1.0).
Vaulter baseline: `074ef0c2740f0e13dfed2952008dd754625724a3`.

## Direction

Edge Rail is the target UI. Fit Vaulter's capabilities into its design language and interaction
model. Existing UI decisions, interfaces and architecture checks are migration work, not vetoes.
Adopt the actual shell, typography, Graphite theme, glass chrome, solid content surfaces, corner
actions, sheets and three form factors. Restyling the old shell would not achieve this goal.

The user has established this direction. The feature cuts below are recommendations for evaluation,
not approved deletions. Removing a screen or control does not require deleting its stored records,
reading interfaces or Agent tools.

## Proposed product shape

Start with four rail sections: **Chat, Wiki, Tasks, Calendar**. Use the existing Home corner to open
a simple Home screen with Search, Needs you, recent records, History and Settings. Home can initially
use retained Questions and recent destinations; do not invent a general notification service.
Badge counts must describe a real retained state, with any recovery cases visible when opened.

Questions becomes **Needs you**, reachable from Home and relevant Wiki records. It remains retained
question-and-answer behavior, not an Agent permission queue. Decisions remains a record collection
reachable through Search and Home. Graph and Map become contextual investigations reached from Wiki
and Search. Keep existing deep links where feasible, even when their destination leaves the rail.

Search and Home must expose destinations that the rail no longer contains. The current Search
already accepts module destinations, commands and ranked records; moving a section does not justify
throwing away its ranking or navigation. Edge Rail can receive the resulting groups directly.

This fits the kit's recommended 3–5 sections without designing a larger rail. An alternative worth
comparing is to put Needs you on the rail and make Calendar contextual. Usage evidence is needed to
choose between them; repository structure alone cannot establish which is more valuable.

## Capability decisions

| Current capability | Target treatment | Recommendation | Extension needed? |
| --- | --- | --- | --- |
| Chat | Full Chat section; Edge Rail Composer and AgentSteps | Keep dialogue, recovery and recorded activity. Defer Chat as an always-available side pane. | Controlled Composer, rich message content and feed behavior. |
| Wiki | Solid reading content, related-record lists, inspector | Keep reading, embedded records and source support. Replace the old page chrome and serif treatment with Edge Rail typography. | Prose/content presentation; mobile detail flow for evidence. |
| Questions and Answers | Needs you list plus contextual answer form | Keep answering and retry/stale-question review; remove its separate top-level section. | Ordinary TextArea/Segmented and Sheet should suffice initially. |
| Tasks | List, status filters, Sheet editor, explicit row actions | Keep create/edit/status transitions. Replace the multi-column board with a filtered list initially. | No board extension. Check is only Done; preserve other statuses in Select. |
| Calendar | Date-grouped agenda, event list, Sheet editor | Keep dates, precision, status and uncertain/unknown-date groups. Start with an agenda; defer the month grid. | No initial calendar widget. Add one only if agenda review demonstrates a need. |
| Decisions | List and Sheet editor, also shown with related Wiki records | Keep record editing and rationale; remove its rail destination. | No dedicated generic extension. |
| Graph | Topic/relationship list with selectable detail | Keep access to relationships; defer force layout, dragging, legends and tuning controls. | No diagram extension initially. |
| Map | Location list and detail including coordinates | Keep coordinate records and edit access; defer the interactive map. | No map extension initially. |
| History | Recent change list with detail and explicit Revert | Keep a path to history and compensation. Defer elaborate inline diff presentation. | Basic disclosure/detail; before/after text can precede a diff widget. |
| Settings and connections | Dedicated Home destination with ordinary grouped fields | Keep unlock, credentials, provider setup, instructions, persistence and sign-out. Simplify specialized model pickers to fields/lists. | Page composition; a bespoke settings framework is unnecessary. |
| Appearance | Graphite target theme | Defer light/system modes; keep reduced motion/transparency. | No light-theme extension required to begin adoption. |
| Voice | Optional Composer trailing action | Keep if affordable; otherwise defer dictation UI while retaining transcription behavior. | Controlled transcript updates and visible capture state if included. |
| Hover previews | Explicit record selection and detail navigation | Defer hover popups. | None. |

The calendar, graph and map implementations are real capabilities, not just decorative widgets.
Deferring them is an intentional reduction in visual exploration. Record access through lists and
search must be reviewed before treating their replacement as sufficient.

## Production blockers and smallest resolutions

### 1. Composer ownership and action availability — extend Edge Rail

`src/components/Composer.tsx` owns its text, trims and clears it immediately after `onSend`, and
registers the phone corner Send whenever text exists. `send()` does not check `busy` or `disabled`.
Desktop Enter can still send during busy state and lacks an IME guard.

Give Composer controlled text/change inputs and explicit submission availability. The caller decides
when accepted work clears the draft. Route Enter, inline Send and corner Send through the same guarded
action; preserve IME editing and make Stop replace Send consistently. This is needed even if voice and
Chat panels are cut. It does not require preserving Vaulter's existing TextBox interface or styling.

Questions can use a normal controlled TextArea with a Sheet Save action; there is no requirement to
recreate one universal Chat-and-Questions text-entry abstraction.

### 2. Modal, keyboard and portal behavior — harden Edge Rail

`src/utils.ts` moves initial focus and restores it, but does not trap focus or make the background
inert. Escape handlers are independent window listeners. `Sheet` and `CommandPalette` choose the
first matching shell/root in the document, rather than their provider's host. Tablet sidebar declares
a modal dialog without the shared focus helper. Search does not connect highlighted results to the
input with an active-descendant contract or scroll the selected result into view.

Provide a scoped overlay host and one active-layer dismissal/focus policy. Ensure keyboard users can
reach every choice, selection remains visible, and IME Enter does not choose a search result.
Toast Undo currently intercepts Cmd/Ctrl+Z while editing; protect native text undo and scope shortcuts
to the active task. These are behavior requirements, not a requirement to retain Base UI. An internal
interaction library is an implementation choice and must preserve Edge Rail's visuals.

### 3. Phone keyboard and occupied corner — verify, then extend as needed

The kit has bottom safe-area CSS, but no visual-viewport handling. Source inspection cannot establish
that phone search and Composer stay above a real software keyboard. Test this on a phone before
delivery; add viewport-aware positioning if the host/browser behavior is insufficient.

Several mounted CornerChoices groups can portal into the same slot. Save, Send, bloom and approval
choices can also compete for the corner. Present one focused task at a time, and let the active Sheet
or detail screen own its actions until dismissed. Do not mount every question's choices in the shared
corner. Reduce competing UI before adding a general multi-pane coordinator.

### 4. Details on phones — finish the kit's documented model

`PhoneShell` never renders `inspector`; the README describes phone details as a pushed screen.
Implement that flow once: caller-supplied detail content becomes a phone screen with Back, a tablet
overlay, and a desktop inspector. This is a natural completion of Edge Rail, rather than an extension
to reproduce Vaulter's full-height mobile drawers. Evidence inspection makes this necessary even if
Graph, Map and Chat side panes are deferred.

### 5. State across form-factor changes — adapt the mounting strategy

`AppShell` switches between PhoneShell, TabletShell and DesktopShell, remounting their content.
Vaulter editors currently keep drafts and some recovery state in mounted presentation. A resize can
therefore abandon unsaved work if those editors are moved into the shell unchanged.

Keep the content subtree stable while chrome changes, or move task lifetime outside the switching
shell before integration. Test a dirty editor, a pending save and an accepted save failure across
700px and 1200px. Preserving the old breakpoints is unnecessary.

### 6. Rich content and scrolling — add a small content family

The kit supplies lists/cards and AgentSteps, not a rich message or knowledge reader. Build solid
prose, code, metadata and supporting-source presentation using its tokens. Keep record interpretation
with the owning module. The initial scope is readable Chat/Wiki content and explicit source links;
selection clipping, hover previews and syntax-rich diffs can follow later.

The shell already owns a scrolling main area. Replace old nested full-height layouts with a deliberate
content scroll owner; Chat additionally needs following-new-content behavior that respects a user
reading earlier messages. Do not transplant the old feed/dock geometry into the new shell unchanged.

### 7. Unlock and configuration — compose the missing screens

Edge Rail explicitly excludes onboarding and connection screens. Existing TextField, Button, Card,
Banner and list presentation should cover Vaulter's unlock and configuration tasks. A full onboarding
system is unnecessary, but a person must still unlock and configure a usable Vault through the new UI.

### 8. Packaging and repository policy — migration work

Edge Rail is a private source repo. A Git dependency must build its exported `dist` files, which are
not committed and have no install preparation script. Choose a reproducible pinned source build or
private package/artifact. Keep one authoritative kit; avoid a fork copied into Vaulter and a second
kit still evolving on GitHub.

Replace checks that require old public exports, class/style bans, old geometry and the old catalogue
with checks for the adopted interface and retained behavior. ADR 0001's mandated Base UI Search and
ADR 0006's existing pane policy must be superseded where they conflict with adoption. This is already
authorized by the stated direction; it is not an adoption blocker requiring another permission.

## What must survive simplification

Readable retained records; finding and opening them; unlocking/configuring the Vault; explicit
mutation outcomes; retry without repeating an accepted effect; recovery drafts; answering Questions;
source/evidence access; and a reachable History/Revert path. Preserve meaningful record states such
as uncertain dates and non-Done task statuses. These have user-visible consequences that a prettier
list alone cannot replace.

AgentSteps and ApprovalCard are presentation, not execution or permission enforcement. Use them for
actual projected states and actionable requests. Do not fabricate an approval subsystem merely to
fill a component example. If new external effects are added, their owner must enforce authorization.

## Adoption sequence

1. Review the proposed navigation and deferred features with equivalent fictional records. Establish
   a target-only preview/comparison entry using the real Edge Rail shell at 390, 800 and 1440px.
2. Harden Composer, overlays, content lifetime and the phone detail flow in vault-of-glass. Establish
   focused behavior/browser checks for those contracts. Verify software-keyboard behavior separately.
3. Integrate a pinned kit build. Implement Home, unlock/configuration, Chat and Wiki with real module
   interfaces. Establish record navigation, evidence selection, reload and save recovery in production
   fixtures before expanding the migration.
4. Port Tasks, the calendar agenda, Needs you, Decisions, relationship/location lists and History.
   Remove superseded presentation and rewrite obsolete architecture/catalogue/browser assertions.
5. Run focused local checks for changed behavior. Push the implementation branch and inspect that
   commit's full CI. Review whether any deferred visual capability actually needs to return.

This sequence starts adoption with a smaller coherent product. It does not require extending the kit
with a task board, month grid, diagram engine, map renderer, light theme or universal supporting pane.

## Evidence and limits

The target's typecheck, library build and focused `src/edge-rail.test.tsx` passed in an isolated
checkout (12 tests). Those tests cover tokens, shortcuts, badges, basic shell forms, phone Sheet Save
and toast Undo. They do not establish real browser geometry, modal isolation, keyboard viewport
behavior, resizing lifetime, rich content or Vaulter integration. No adopted production UI has been
implemented yet. The recommendations above come from source inspection, not observed usage data.
