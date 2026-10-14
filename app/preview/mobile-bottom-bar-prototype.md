# Mobile bottom-bar prototype

Question: which mobile navigation layout leaves enough room to read and type when the keyboard is
open, while keeping navigation easy to reach?

This comparison is throwaway work on `prototype/mobile-bottom-bar`. The ordinary preview still
renders the current Product. The experiment supplies the same Product, fictional records and
scripted Agent, with alternative navigation arrangements.

Run `npm run design:mobile-bar`. In the existing preview pill, enable Mobile and cycle designs.
The default now puts page actions above the fixed Modules anchor, with a page Search button.
The URL retains the selection.

## Selected direction: page controls above the Modules anchor

On 2026-10-14 the user selected variant 1 (`corner-split`) as the strongest structure, then asked
for page actions above the module menu. The user then definitively selected the Search icon,
requested filtering on the rail, and approved Settings beside the brand. The Modules button is
the bottom anchor; adding or
removing page actions changes only the height above it. The app still owns a freestanding rail
fixed to the lower-right of the visible viewport, with all input surfaces in the lane to its left.

Open `/preview/?navigation=page-rail&variant=corner-page-search&conversations`, or compare:

| Variant | Chat | Questions and Wiki index |
| --- | --- | --- |
| `corner-page-search` — selected | New conversation, Conversations, then Modules | Search, Filters, then Modules; Search reveals and focuses a bottom input to the left |
| `corner-page-input` — previous option | New conversation, Conversations, then Modules | Filters and Modules beside an always-visible bottom search input |

The two search choices have the same page-owned filter behavior and fictional fixtures. The
button option leaves more of the page visible at rest. Its input is nonmodal, so filtered results
remain visible while typing. Clear resets the query; Close collapses the empty field and returns
focus to Search. Escape clears and closes it. The input option remains available in the retained
comparison, labelled Previous option. Detail views without collection controls show only Modules.
The Search-icon choice is settled; the bottom-input alternative is retained for reference.

Filters opens a compact single-choice list to the left of the rail. Questions supplies its existing
Open, All, Answered and Abandoned status choices. Wiki supplies the classifications already present
on its pages, plus All pages to clear the selection. A small dot marks a filter that limits the
collection; the accessible description states the selected choice. Selecting a choice or pressing
Escape returns focus to Filters. Search and filtering combine without copying their state into the
app shell. Search input, filter menus and module menus retain their separate layers and hit targets.

The anchor uses a grid icon to distinguish it from Chat's conversation-list action. Chat's rail
is 52×148px; the selected Search-and-Filters rail is also 52×148px, the bottom-input alternative is
52×100px, and the single-anchor rail is 52×52px. Targets stay
44×44px. The input retains its own rounded surface, with no background joining it to the rail.
Shared presentation measures the whole rail, any search surface and the bottom inset to reserve
trailing scroll space; final content and Questions' Save answer can scroll above the full rail.
The bottom field has its own app-owned input layer below expanded menus and dialogs. This keeps
the last menu actions usable when search is visible, while the rail stays above those overlays.

Settings moves to the right of the Vaulter brand in both the expanded mobile module menu and the
desktop sidebar for these alternatives. Its previous footer row is removed. Its 16px icon matches
the other menu and sidebar icons; the target stays 44px. The menu's icon action
participates in shared menu keyboard navigation. Global Search and Start voice interaction remain
in the Tools group of Modules, rather than occupying a permanent Tools button on the rail.

`PageControls` is the shared module-page slot with three optional contributions: `actions`, `search`
and `filters`. Chat's Toolbar supplies its actions through this same slot; Questions and Wiki
declare their collection controls together. Modules supply labels, choices, values and callbacks.
The kit owns inline fallback, mobile relocation, input placement, menu focus, collision bounds and
viewport clearance. There are no module-specific route decisions in Product or NavigationSuite.
Existing inline filter content can be supplied as children; Wiki uses this to retain its Clear
filter action outside the rail prototype. Supporting Chat panes retain their own header actions.
Handlers, draft lifetime, filtering, submission and persistence stay in their owning modules. The
ordinary Product preview remains neutral; older edge-bar comparison URLs are retained.

The earlier Search-button versus bottom-input comparison, before the added Filters control, is
captured at commit `5f8d12573869a361f06dda52b005bbf46c4d0850`. Its verdict is Search button. The
current picker identifies the chosen rail and keeps the bottom-input option available separately.

Temporary browser probes check both choices at 320, 390 and 430px, including changing action counts,
conversation chooser dismissal and focus, New conversation and busy disablement, drafts, input
height, Send/Stop hit targets, filtering and Clear/Close, Questions' Save answer, detail views,
status and classification filter selection, active indicators, global Search, brand Settings with
pointer and keyboard, and desktop/mobile transitions. Controlled
430/72 and 340/100 keyboard viewport resize/pan cases keep the rail and inputs usable. The probes
also check the previous comparison and neutral preview, with no runtime errors.

Focused existing browser checks cover Chat, Questions, Wiki, Composer, navigation and comparisons.
Shared composition, catalogue and ownership checks, lint, types and the bundled preview are checked
before publishing. Complete verification belongs to the exact pushed commit's aggregate CI job.
This remains a prototype comparison.

## Previous comparison: fixed lower-right edge bars

The user's latest direction on 2026-10-14 reverses the earlier input-clearance relationship:
the rail stays fixed in the lower-right corner and the text input places itself to the left.
The corner is relative to the visible viewport, so the same controls remain above the keyboard.
The rail never follows an input's height, focus, scrolling or module. No placement controls or
dragging are part of this comparison.

Open `/preview/?navigation=edge&variant=corner-split`, or cycle these three choices in Preview:

| Variant | Resting controls | Expanded list |
| --- | --- | --- |
| `corner-split` | Modules + Tools, in a 52×100px rail | Separate module and tool lists keep each group short and close to the thumb |
| `corner-tab` | One labelled Menu tab, 46×92px | A single sidebar-style list groups Modules and Tools; gives the input slightly more width |
| `corner-search` | Search + Menu, in a 52×100px rail | Search opens directly; Menu contains Modules, voice and Settings |

All controls retain at least 44px touch targets. Menus expand inward to the left, retain the
current-module marker and scroll within the available viewport. They use the existing shared
menu adapters for focus, keyboard navigation, outside dismissal and collision bounds. The
same global Search, Settings and voice actions apply on every module.

The app rail owns its own portal outside the module workspace. Shared kit input registration
identifies the input group, surrounding Dock or standalone form. Docks reserve right padding
for the rail and a 12px gap; the entire trailing input stack, including status and suggestions,
stays in the left lane. Standalone forms keep the field and its submission actions to the left
too. Geometry is measured from stable outer edges, so narrowing a field does not repeatedly
recalculate from its own narrowed width. The shared rule also applies to portalled Chat panes.
Private styles and markers are removed when returning to the desktop layout.

The input keeps its own surface; the surrounding compact Dock backing is transparent in these
variants. That previews the direction of [ticket #71](https://github.com/JimLundin/vaulter/issues/71).
[Ticket #70](https://github.com/JimLundin/vaulter/issues/70) still owns the production work to unify
Chat, Questions and other inputs. This experiment changes shared presentation geometry without
moving draft lifetime, submission, persistence or voice ownership out of their modules.

The ordinary preview remains current Product. The earlier adaptive-rail comparison remains at
`?navigation=freestanding&variant=free-rail`; its last delivery was `d396750`. The fixed input lane
is a new comparison, and the former collision recommendation below is retained as history.

Browser probes pass for all three variants at 320, 390 and 430px: fixed right/bottom placement,
input and action hit regions, changing input height, focus and draft retention, module changes,
Questions and Save answer, safe areas, and controlled 430/72 and 340/100 keyboard resize/pan.
Additional checks drive scripted voice capture, Finish recording, Send and busy Stop; global
actions, supporting Chat Docks, scrolling menus, keyboard focus, dark appearance, device changes,
input-lane cleanup, the reload-stable picker and neutral/earlier previews. These are throwaway
browser probes, not new production regression tests. Focused existing Composer, navigation and
comparison checks pass (22), as do shared composition, catalogue and ownership checks (60), lint,
types and the design build. Full verification belongs to the exact pushed commit's CI.

Physical phone review is still needed for thumb reach and native keyboard behavior. Variant 1's
structure was selected for the next comparison above; no production promotion has been requested.

## Earlier comparison: minimal edge rail

The user selected Edge rail on 2026-10-14, with two refinements: allow bottom alignment when there
is no text field to clear, and reduce the rail to one or two buttons that expand into lists.
Modules must remain a growing list, rather than becoming permanent buttons in the rail.

The freestanding comparison defaults to `/preview/?navigation=freestanding&variant=free-rail`.
The user rejected Thumb cluster and Expandable puck. Only the two edge rails remain in this
comparison; the removed designs are captured in commit `a1a2e17` and the history below. Their old
URLs now fall back to the two-button rail.

| Variant | Resting controls | Expanded list |
| --- | --- | --- |
| `free-rail` | Modules and Tools | Modules shows the brand, sync status and full destination list with a current marker; Tools shows Search, voice, Settings and dock placement |
| `free-rail-single` | App menu | One sidebar-style list with Modules, Tools and dock placement groups |

The two-button rail is 60×110px, down from the original four-control rail's 60×210px. The one-button
rail is 60×60px. Both retain 46px targets and expand beside the chosen edge. Lists scroll within
the visible viewport as modules grow. The two-button version is the default because its shorter
lists keep common destinations and actions closer to the thumb.

Dragging can reach 12px from the bottom when the space is clear; Tools also offers Align to bottom.
Alt + arrow keys move the focused rail control, Alt + End aligns it to the bottom, and Alt + Home
resets its comfortable initial height. These keys leave ordinary menu keyboard navigation available.
Both edges honor safe-area insets.

The earlier focus-only 88px clearance failed: after blur, a bottom-aligned rail covered Chat's
microphone. The failing browser probe hit Tools instead of Start voice interaction. A fixed lift
also cannot account for different input heights.

Input and Textarea primitives now register with the kit's scoped presentation policy. A grouped
field protects the whole input surface, including inset voice/Send/Stop targets; a standalone
field also protects its form's submit actions. Actual visible bounds account for viewport pan,
scrolling, resizing and clipping. The rail chooses the nearest clear vertical position along the
selected edge with an 8px gap, before focus and after blur as well as during editing. Dragging
uses the same protection. The user's preferred placement is retained separately and restored when
the obstruction disappears. No permanent bottom floor, module-specific selector or route offset
is used.

The rail stays in its own app-level portal outside the module workspace. Its controls, owner and
preferred placement survive module navigation and device changes. It adds no footer row and keeps
the same one or two buttons while typing.

See [mobile edge-rail references](mobile-edge-rail-references.md) for first-party examples and
placement guidance. Samsung Edge panels are the closest visual reference; AOSP's floating menu
provides the preferred-versus-temporary position model. The shared input exclusion rule is our
proposal. [Ticket #70](https://github.com/JimLundin/vaulter/issues/70) captures the requested single
text box composition across Chat, Questions and comparable module inputs. This prototype does not
perform that migration.

This remains a design prototype. The original freestanding rail is retained in commit `1b72cd9`,
and the earlier comparisons below retain their URLs and verdicts.

Browser verification drives the real input path and checks hit areas as well as layout: empty
Chat, focused Send, blurred microphone, changing input height, bottom preference restoration and
touch dragging toward the input. Repeat with both rails, either edge and 320, 390 and 430px widths.
Controlled keyboard viewports include resize and pan; draft and focus must survive. Questions'
longform field exercises the same shared geometry without a special rail implementation. Expanded
lists, global actions, current-module markers, device transitions, keyboard menus, picker reload
and the neutral preview are also checked. Physical keyboard and thumb reach remain a device review.

This iteration's bundled probes pass for both rails at all three phone widths, including actual
scripted voice capture, Finish recording, Send and busy Stop hit targets. Questions' field and Save
answer remain usable on either edge with a 430px viewport panned by 72px. Simulated inset geometry
is honored. Focused Composer (10), navigation/comparison (12), Questions draft (2), shared
composition and ownership checks pass, as do lint, TypeScript and the design build. Complete
verification belongs to the exact pushed commit's CI.

## Freestanding app dock

The user's clarification on 2026-10-14 supersedes the joined-capsule recommendation: the dock is
an independent application element, stays within thumb reach, and must not attach to or depend on
the active module. Side dock was the strongest direction, but its page-dependent controls and
disappearance during typing did not satisfy that requirement.

The previous round, retained in commit `a1a2e17`, compared three designs through
`/preview/?navigation=freestanding&variant=free-cluster`. They shared one app-level portal outside
the workflow workspace. Navigation, Search and voice stayed available on every page. App navigation
opened beside the dock, keeping destinations within reach. This history explains the selection;
the current comparison contains only the minimal rails above.

| Variant | Arrangement | Trade-off |
| --- | --- | --- |
| `free-rail` (original at `1b72cd9`) | Vertical Menu, Search, voice and grip at either edge | Direct controls; collapses to a reachable puck while typing |
| `free-cluster` | Two-by-two Menu, Search, voice and grip | All controls in a shorter thumb area; occupies more width |
| `free-orbit` | Small puck expands into three controls around the thumb | Smallest resting footprint; one extra tap |

Drag any dock to a comfortable height or the opposite edge. The grip also switches edges on tap
and moves with arrow keys; Home resets. Navigation offers the same placement controls for the puck.
Position stays in memory across module navigation and device changes. Visible viewport resize/pan
keeps the dock above the keyboard. None of these designs hides navigation during text entry.

Thumb cluster was the initial recommendation because the global controls were concentrated in a
shorter reach than the original rail. The user selected Edge rail, requested the minimal refinement
above, then explicitly rejected Thumb cluster and Expandable puck. Their implementation remains
available in the branch history.

Bundled browser probes confirm the same dock element, controls and geometry across Chat, Wiki,
Questions and History. At 320, 390 and 430px both edges keep targets at least 44px and navigation
inside the viewport. A controlled 430px visual viewport panned by 72px retains focus and keeps the
dock reachable; switching modules retains the draft. Touch and mouse dragging snap to the chosen
edge without activating controls. Dock navigation dismisses Settings and Search; device switching
retains the draft and placement, and the picker survives reload. Dark mode, focused navigation,
comparison, Settings, Product behavior and kit ownership checks pass, along with lint, types and
the design build. Physical keyboard and ergonomic acceptance remain a device review.

## Floating-dock direction

The user selected the floating dock on 2026-10-14: “floating dock is for sure the right way to go.”
The remaining question is how navigation and the message field should share that floating area.
The first comparison is retained below; the selected direction gets its own five-design comparison
at `/preview/?navigation=dock&variant=dock-joined`.

| Variant | Arrangement | Trade-off |
| --- | --- | --- |
| `dock` | Original Menu/Search capsule beside the composer | Familiar baseline; two separate surfaces |
| `dock-joined` | Menu, Search and composer in one floating capsule | One bottom row and one surface; keeps direct Search |
| `dock-bubble` | Circular More button beside a wider composer | More room to type; Search is inside Menu |
| `dock-shortcuts` | Chat, Wiki, Questions and More in a floating capsule | Direct destinations; composer takes a second row |
| `dock-side` | Vertical Menu/Search dock at the right edge | Full-width composer; controls are slightly higher |

Every variant keeps the microphone available on other pages and hides the dock during text entry.
Done restores navigation without clearing the draft. Side dock leaves suggested prompts clear.
The picker is in the existing Preview controls, and updates the shareable `variant` query.

Joined dock was the initial recommendation for this round, superseded by the freestanding
requirement above. The specific floating layout has not been selected.

All five dock variants passed bundled browser probes at 320, 390 and 430px, including navigation,
Search, Settings, Wiki filtering, microphone access and draft retention. Dark mode and a controlled
visual viewport reduced to 430px and panned by 72px keep the focused field visible. Device switching
retains the draft, the picker survives reload, and the neutral preview has no active comparison.
Focused navigation/comparison and kit ownership checks, lint, TypeScript and the design build pass.

## First comparison

The original `/preview/?navigation=prototype&variant=slim` URL keeps these alternatives:

| Variant | Arrangement | Trade-off |
| --- | --- | --- |
| `current` | Existing Menu, Search and Settings footer | Baseline; reserves 57px while editing |
| `slim` | Chat, Wiki, Questions and More in a 49px row | Direct destinations; Search and Settings live in More |
| `dock` | Floating Menu and Search beside the Chat composer | One bottom row; narrower message field before focus |
| `header` | Menu and Search in the existing page header | Most vertical space; navigation is farther from the thumb |

Open `/preview/?navigation=prototype&variant=slim` locally. Hosted previews use the same query at
the branch preview root. The picker changes `variant`; switching devices preserves the mounted
Product and its draft. Switching designs remounts it.

All three alternatives remove bottom navigation while an editable field has focus. The composer
uses the full width, keeps its Send control and follows the visible viewport. Slim tabs and
Floating dock expose Done in the header to leave editing without losing the draft. Header menu
keeps its navigation available. Other pages retain access to voice through More/Menu; Floating
dock also includes the microphone next to navigation.

Observed result: the existing footer retained 57px at a 390×430 viewport with Message focused.
The focused probe fails on the baseline and passes for all alternatives: footer height is zero,
focus remains in Message, and the field ends at 417px within the 430px viewport. Menu, Wiki,
Settings, Search and draft retention work in phone emulation. The default navigation, Composer
and preview checks pass on desktop and phone; kit ownership/composition checks, lint, TypeScript
and the bundled design build pass.

The user selected the floating-dock direction; the follow-up comparison explores its layout.
Headless phone emulation and controlled viewport changes do not display a real device keyboard.
After selection, rewrite the selected behavior in the shared kit, add its browser regression
coverage, and verify the production login/storage path before promotion. Retain this comparison
and the final verdict on its prototype branch.
