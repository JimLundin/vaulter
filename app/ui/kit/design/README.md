# Design

The reference design for Pip's UI. It's a reference to build from, not code the app ships.

The canvas has two pages, each exported as is: `personal-agent-ui.html` (the app) and
`personal-agent-ui-extensions.html` (the UI for extensions). Each is a self-unpacking bundle: open it in a
browser to see its screens on one board. `screens/` holds all thirteen screens unpacked into plain,
standalone HTML (inline styles, no scripts) so they can be read and diffed. The only changes from the bundle are that the export's runtime is removed and the fonts load
from Google Fonts instead of being embedded.

| Screen | Size | What |
|---|---|---|
| `screens/mobile-today.html` | 390×844 | Today: the day's timeline of places and notes, Pip's questions, the record button |
| `screens/mobile-recording.html` | 390×844 | Recording, with Pip asking which Anna mid-dictation |
| `screens/mobile-clarify.html` | 390×844 | The questions sheet after a recording |
| `screens/mobile-search.html` | 390×844 | Search: an answer, then people and notes |
| `screens/desktop-wiki-page.html` | 1280×800 | A curated wiki page: prose with sources, facts, linked pages, an open question |
| `screens/desktop-questions.html` | 1280×800 | The questions inbox |
| `screens/desktop-search.html` | 1280×800 | The `/` search palette with filters |
| `screens/mobile-extensions.html` | 390×844 | Extensions: built-in and added, Pip's suggestion, "Ask Pip for a feature" |
| `screens/mobile-extension-proposal.html` | 390×844 | Pip proposes Workouts: why, a preview on real notes, what it adds, its access |
| `screens/mobile-page-panels.html` | 390×844 | A place page built from panels by Map, Today and Questions, each labelled with its source |
| `screens/desktop-extension-settings.html` | 1280×800 | Map's settings: Pip's access per tool, what it adds, versions with rollback, dependants |
| `screens/desktop-extension-review.html` | 1280×800 | Reviewing Pip's change to Map, 1.3 to 1.4: why, changes, new access, checks, preview |
| `screens/desktop-map.html` | 1280×800 | Map's own screen, which the extension added to the sidebar |

Type is Geist (UI), Geist Mono (keys and code) and Newsreader (wiki prose). Colours are Tailwind's zinc
scale with category colours: blue for people, green for places, orange for events.

The selected fictional wiki evidence reference is available at `#/prototype/provenance/` in the
design preview and as a paired catalogue example. Design A was chosen: select an underlined
statement to inspect its exact source quotation and superseded context beside the page on desktop
or in the shared Drawer on phones. Rejected B sidenotes and C history trace are retired; this
does not alter Product History or the retained Today/activity Timeline design. Future design
sessions compare supplied alternatives with the separate reusable DesignComparison capability.
