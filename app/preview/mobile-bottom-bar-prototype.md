# Mobile bottom-bar prototype

Question: which mobile navigation layout leaves enough room to read and type when the keyboard is
open, while keeping navigation easy to reach?

This comparison is throwaway work on `prototype/mobile-bottom-bar`. The ordinary preview still
renders the current Product. The experiment supplies the same Product, fictional records and
scripted Agent, with alternative navigation arrangements.

Run `npm run design:mobile-bar`. In the existing preview pill, enable Mobile and cycle designs.
The default is now Thumb cluster. The URL retains the selection.

## Freestanding app dock

The user's clarification on 2026-10-14 supersedes the joined-capsule recommendation: the dock is
an independent application element, stays within thumb reach, and must not attach to or depend on
the active module. Side dock was the strongest direction, but its page-dependent controls and
disappearance during typing did not satisfy that requirement.

Three follow-up designs at `/preview/?navigation=freestanding&variant=free-cluster` share one
app-level portal outside the workflow workspace. Position uses only visible viewport bounds and
the user's chosen edge and height. Navigation, Search and voice are the same on every page. Chat's
composer stays with Chat; it does not determine the dock's geometry. App navigation opens beside
the dock, keeping destinations within reach rather than sending the user to the page header.

| Variant | Arrangement | Trade-off |
| --- | --- | --- |
| `free-rail` | Vertical Menu, Search, voice and grip at either edge | Direct controls; collapses to a reachable puck while typing |
| `free-cluster` | Two-by-two Menu, Search, voice and grip | All controls in a shorter thumb area; occupies more width |
| `free-orbit` | Small puck expands into three controls around the thumb | Smallest resting footprint; one extra tap |

Drag any dock to a comfortable height or the opposite edge. The grip also switches edges on tap
and moves with arrow keys; Home resets. Navigation offers the same placement controls for the puck.
Position stays in memory across module navigation and device changes. Visible viewport resize/pan
keeps the dock above the keyboard. None of these designs hides navigation during text entry.

Thumb cluster is the initial recommendation because the global controls are concentrated in a
shorter reach than the rail. The specific arrangement remains unselected. Earlier comparisons are
retained for reference; they do not meet the clarified independence requirement.

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
