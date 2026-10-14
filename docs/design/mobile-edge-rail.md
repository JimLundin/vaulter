# Mobile edge rail

Selected on 14 October 2026: variant 1, a freestanding lower-right edge rail with page actions above
the Modules anchor. Search uses an icon in the rail, opening a field to its left; Filters uses an
inward choice menu. Chat supplies New conversation and Conversations. Settings sits beside the
Vaulter mark on desktop and in the mobile Modules menu, retaining the consistent 16px menu icon.

The rail follows the visible viewport and safe-area insets. Module inputs keep a left lane, and
scrolling pages reserve clearance for the complete rail and open Search field. Module values and
handlers remain in their workflows; the shared `PageControls` contract controls presentation.

The default preview renders the current Product. Comparisons and their verdict remain in the
[archived prototype](https://github.com/JimLundin/vaulter/tree/archive/2026-10-14/prototype/mobile-bottom-bar)
at `bafe7baf2c7384ee058545efadb199ed7f70c744`. The retained
[hosted comparison](https://jimlundin.github.io/vaulter/preview/prototype/mobile-bottom-bar/?navigation=page-rail&variant=corner-page-search)
contains the alternatives. Rejected variants do not ship in the production entry.

Verification lives in `tools/browser/edge-rail.spec.ts` and the production Questions/Wiki specs.
Production checks use real login and storage with fictional transports, explicit answer writes
and reload. A physical phone remains useful for native keyboard and thumb-reach review.

The compact Chat input backing is removed as part of this promotion (#71). A single shared text
box across Chat, Questions and other editors remains separate work in #70.
