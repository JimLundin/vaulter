# Mobile bottom-bar prototype

Question: which mobile navigation layout leaves enough room to read and type when the keyboard is
open, while keeping navigation easy to reach?

This comparison is throwaway work on `prototype/mobile-bottom-bar`. The ordinary preview still
renders the current Product. The experiment supplies the same Product, fictional records and
scripted Agent, with three alternative navigation arrangements.

Run `npm run design:mobile-bar`. In the existing preview pill, enable Mobile and cycle designs.
The default is Slim tabs. The URL retains the selection:

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

No design has been selected yet. Slim tabs is the starting recommendation because it exposes the
main destinations and still clears the keyboard. Try the other two on a phone before deciding.
Headless phone emulation and controlled viewport changes do not display a real device keyboard.
After selection, rewrite the selected behavior in the shared kit, add its browser regression
coverage, and verify the production login/storage path before promotion. Retain this comparison
and the final verdict on its prototype branch.
