# UI-kit cleanup #20: implementation and acceptance

Spec: [#20](https://github.com/JimLundin/vaulter/issues/20).
Integration branch: `spec/20-ui-kit-cleanup`. Review base: `fe941c2`.

The [agent brief](../20-agent-brief.md) and
[maintainer inventory](../20-reduction-inventory.md) define the approved scope. The inventory
preserves walkthrough evidence and adds a current implementation/dependency reconciliation.
Ticket records below contain rechecked consumers, reasons and relevant focused validation.

## Ticket evidence

| Ticket | End-to-end result | Status and evidence |
|---|---|---|
| #23 | Future supplied designs compare independently of device selection | Integrated; [consumer record](23.md). Its preparatory A/B/C registration is superseded by #26. |
| #24 | Expanded left desktop navigation and preserved phone Menu/loading/groups/nested actions | Integrated; [consumer record](24.md). Rejected collapse/Sidebar variations and public Skeleton retired. |
| #25 | Shared workspace and adaptive conversation/supporting content | Integrated; [consumer record](25.md). Alternate frames/fixed panel retired; current notifications retained. |
| #26 | Selected wiki evidence A with exact source quotations and superseded context | Integrated; [consumer record](26.md). B/C retired; same evidence tree and focus survive responsive changes. |
| #27 | Retained SettingsMenu, SearchSurface/Command and adaptive Overlay/Drawer | Integrated; [consumer record](27.md). Rejected shells/public Dialog assembly retired; private adapters and responsive footer retained. |
| #28 | Phone-stacked columns and horizontal rounded tabs | Integrated; [consumer record](28.md). Page, mounted-tab drafts, question/inbox ListDetail and Today/activity Timeline remain. |
| #29 | Outlined joined standard pressed-choice groups | Integrated; [consumer record](29.md). Single/multiple behavior and diagnostic/keyboard/touch checks retained. |
| #30 | Semantic fields, adaptive Settings grid and inline/inset grouped inputs | Integrated; [consumer record](30.md). Rejected smaller/responsive/block add-on styles retired. |
| #31 | Standard browsing rows, leading visuals and status/category presentation | Integrated; [consumer record](31.md). Rejected Item/Badge variations retired; current/actions/chips remain. |
| #32 | Essential voice/activity, both answer layouts and ordinary shortcut hints | Integrated; [consumer record](32.md). Duration/decorative status/numbered/enlarged hint alternatives retired. |
| #33 | Retained real MapLibre map with source-unused Leaflet removed | Integrated; [consumer record](33.md). Real dark/light maps, marker selection/routes and sm/md/fill sizing reviewed; opt-in regression passed all three browser projects. |

## Retained and provisional scope

Active navigation/workspace, Settings/Search, Agent/Composer/voice, History/revert and Unlock retain
their task interfaces. Sidebar groups/nested destinations/counts/loading/independent actions remain
designed support for richer navigation. Supporting panels, selected wiki evidence, maps/charts,
Timeline, ListDetail, questions and supplied recommendations retain their presentation without
implementing new domain workflows.

Semantic forms/fields, text/radio/checkbox controls, shared typography/layout/scrolling,
information/error alerts and optional alert icons, cards/empty states, attributed embedded Panel
content, Item visuals, dropdown menus and ordinary help/shortcut hints remain. Shared private
interaction, association, Skeleton, Avatar root/fallback, Badge secondary and map dependencies
remain where retained consumers require them. Unlisted private Avatar helpers are evidence-only
assessment candidates; this cleanup does not require unrelated pruning.

Cite/Sources remain provisional for later embedded evidence design. HoverPreview remains
provisional pending useful touch/keyboard interaction assessment. Main navigation consolidation
remains subsequent architecture work. Notice attention cards and current Toaster behavior remain;
shared notification lifecycle, agreed floating placement and preview improvements belong to
[#22](https://github.com/JimLundin/vaulter/issues/22).

## Final integration acceptance

All approved ticket implementations are integrated on `spec/20-ui-kit-cleanup`. Runtime checks
below were completed at `bd50a00`. The minor review cleanup at `9fbc997` preserves exact
claim-button classes and catalogue feedback behavior; its typecheck, changed-source lint and 24
focused browser cases pass. Final primary lint verification after that cleanup remains to be
recorded before tracker resolution.

| Required check | Observed result |
|---|---|
| Typecheck | Passed, exit 0 |
| Lint | Passed, exit 0; 218 files, 59 warnings and 86 informational diagnostics at bd50a00 (baseline 58 warnings/76 informational diagnostics). Review cleanup removes the added catalogue conditional-render warning. Worktree full lint counted 58 warnings/86 informational diagnostics but hit two toast reexport resolution errors with shared dependency symlinks; typecheck and changed-source lint passed. Final primary lint result remains to be recorded. |
| Full Vitest suite | 32 files and 218 tests passed on full rerun with command-only 30s timeout. Initial run passed 217 tests and timed out the compiler-backed composition check at its 5s limit under concurrent load; no source timeout or assertion changed. |
| Full browser suite: phone, desktop, touch-desktop | 315 passed and three opt-in map cases skipped (318 total), exit 0 in 11.6 minutes at bd50a00. The real-map opt-in regression separately passed all three projects. |
| Product and design/catalogue builds | Passed, exit 0; standard bundle chunks above 500KB advisories remain. Built preview/gallery smoke checks produced no page errors. |
| Standards and Spec code review against `fe941c2` | Standards: no hard violations; one minor duplicated interaction-class finding addressed with existing cn and exact selected/ordinary class equivalence. Spec: zero findings. All 21 existing design-comparison cases and three browsing-row cases passed across phone/desktop/touch-desktop after the review cleanup; typecheck and changed-source lint passed. |
| Product/navigation and retained catalogue visual review | Product and Settings phone/desktop captures plus eight retained paired catalogue captures rerun at bd50a00; no page errors. Readable navigation, fields, evidence and retained examples inspected. |
| Actual MapLibre dark/light, markers/routes/selection/sizes | Real renderer and OpenFreeMap resources reviewed with no outage. All three browser projects passed opt-in regression with CLI90s timeout under concurrent load. Final integrated eight size/theme captures recorded 32 successful resources, three ordinary cancellation requests while changing style/zoom and no page errors; replacements rendered. See [#33 evidence](33.md). |

The earlier integrated browser run had 310 passes and five failures: stale catalogue counts after
shell retirement and actual focus-reveal scrolling of the clipping catalogue frame. The count was
corrected, and overflow:clip keeps scrolling in inner ScrollArea while preventing the frame/portal
from drifting. Selected evidence has a deterministic strict containment regression with atomic
rectangle sampling; geometry tolerance was not relaxed. The final full browser rerun includes
those repairs and all merged map changes; all 315 normal browser cases passed.

## Code review record

Standards: zero hard violations, one minor judgement finding (Possible Duplicated Code), resolved.
Spec: zero findings. The two axes retain their separate conclusions below.

### Standards

Reviewed `git diff fe941c2...HEAD` and the recorded commit list through `bd50a00`, using the original README, ARCHITECTURE, agent/domain/glossary documents, kit README, Search ADR, architecture plan, input-button/design references and accepted UI-kit specs 01–04 with presentation acceptance.

No documented-standard violations found outside rules already enforced by tooling. The changes preserve kit ownership of presentation, private Base UI mechanics, workflow-owned state, public examples and the retained single content tree. Approved removals supersede historical references to the retired interfaces. Final acceptance results remain the integration owner's pending verification work.

One minor judgement call:

- **Possible Duplicated Code** — `app/ui/kit/prototype-provenance.tsx:554`. Both changed claim-button branches repeat `"text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"`. Keep those common interaction classes once and condition only the selected/ordinary decoration classes, using the existing `cn` convention. This reduces the chance that a later focus adjustment affects only one state; it is not a hard standards violation.

The other mandatory smell categories did not reveal actionable findings in the changed implementation. Existing adapters and retained generic wrappers earn their presentation responsibility under the repository's documented ownership/deletion test; the baseline does not justify removing them.

Resolution: common claim-button interaction classes now appear once through existing cn. Before/
after output was compared for both selected and ordinary states and is exactly identical. Focused
existing behavior checks verify the retained interaction rather than asserting the implementation.

### Spec

No concrete findings in `git diff fe941c2...bd50a00` against issue #20, its approved agent brief/inventory, and tickets #23–#33.

The approved public removals and option/style/dependency cleanup match the recorded decisions. Retained Sidebar groups, nesting, counts and loading rows remain; NavigationSuite inputs and Product behavior are unchanged. Generic design comparison survives independently of device selection, while rejected evidence B/C entries are retired. Selected A preserves exact source context, superseded claims, one responsive Drawer content tree and explicit claim focus restoration.

The retained fields, Tabs and ToggleGroup keep their specified semantics and interaction choices. DialogFooter remains reusable through adaptive Overlay; private Base UI adapters remain. MapLibre, its worker and styles remain, with real-map evidence and an opt-in regression covering markers, routes, themes and sizes; the dimension-only camera adjustment supports the requested retained size behavior. Planned maps/charts, Timeline/ListDetail, questions, visual slots, provisional Cite/Sources/HoverPreview and existing notifications are retained without introducing their follow-up workflows.

Final full-suite/build/visual acceptance and the durable acceptance table remain the integrating agent's pending verification; this review does not claim to have rerun those checks.

Spec findings: 0.

Visual acceptance covers expanded left desktop navigation, phone Menu/actions/current state,
drafts/focus through resize, selected A quotation/source/superseded context and bounded 44px close
controls, retained field/Composer semantics, horizontal mounted tabs, phone columns, joined toggles,
row visuals/actions/chips and essential voice/question feedback. Map acceptance must inspect the
actual renderer and external tiles; record exactly any external limitation. Scripted voice examples
and browser tests do not claim real microphone/device validation. Earlier accepted physical Safari
results remain historical evidence for their original changes.

Approved removals, retained behavior, full browser checks, builds, visual review and review
findings are accounted for above. Final primary lint after the exact-behavior review cleanup is
the remaining verification entry. Tracker resolution and owned-worktree cleanup follow it.
