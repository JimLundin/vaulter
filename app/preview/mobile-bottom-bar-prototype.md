# Mobile bottom-bar prototype

Question: which mobile navigation layout leaves enough room to read and type when the keyboard is
open, while keeping navigation easy to reach?

This comparison is throwaway work on `prototype/mobile-bottom-bar`. The ordinary preview still
renders the current Product. The experiment supplies the same Product, fictional records and
scripted Agent, with alternative navigation arrangements.

Run `npm run design:mobile-bar`. In the existing preview pill, enable Mobile and cycle designs.
The default is now Joined dock. The URL retains the selection.

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

Joined dock is the initial recommendation for this round. The specific floating layout has not
been selected; these remain reviewable prototypes.

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
