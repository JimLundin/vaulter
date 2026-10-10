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
| #33 | Retained real MapLibre map with source-unused Leaflet removed | Pending integration and final visual acceptance; [ticket contract](https://github.com/JimLundin/vaulter/issues/33). |

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

Final acceptance is pending. Focused ticket checks are recorded in their evidence files; this
section must be completed with actual results after all code merges and code-review fixes.

| Required check | Final result |
|---|---|
| Typecheck and lint | Pending final integration run |
| Full Vitest suite | Pending; record actual file/test totals |
| Full browser suite: phone, desktop, touch-desktop | Pending; record actual totals and resolved failures |
| Product and design/catalogue builds | Pending; record warnings or material limitations |
| Standards and Spec code review against `fe941c2` | Pending; record findings and resolutions |
| Product/navigation and retained catalogue visual review | Pending final integration review |
| Actual MapLibre dark/light, markers/routes/selection/sizes | Pending #33 integration and final visual evidence |

Visual acceptance covers expanded left desktop navigation, phone Menu/actions/current state,
drafts/focus through resize, selected A quotation/source/superseded context and bounded 44px close
controls, retained field/Composer semantics, horizontal mounted tabs, phone columns, joined toggles,
row visuals/actions/chips and essential voice/question feedback. Map acceptance must inspect the
actual renderer and external tiles; record exactly any external limitation. Scripted voice examples
and browser tests do not claim real microphone/device validation. Earlier accepted physical Safari
results remain historical evidence for their original changes.

Complete acceptance only when the approved removals, retained behavior, full checks and review
findings are accounted for on the final integration commit. Tracker resolution and owned-worktree
cleanup follow final verification.
