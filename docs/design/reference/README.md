# Historical screen references

These standalone screens preserve the original visual direction, including the earlier extension
architecture. They are historical references; the live [kit gallery](../../../app/ui/kit/README.md)
and Application preview represent current behavior.

`screens/` holds all thirteen screens as plain, standalone HTML with inline styles and no scripts.
Fonts load from Google Fonts. The two duplicate self-unpacking canvas bundles were removed from
the working tree and remain available in Git history.

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

Fictional Wiki evidence is available through the real module pipeline at `/preview/wiki.html`
and as independent paired examples at `/preview/records.html`. Select an underlined statement
for an exact retained source quotation and newer/deleted source context in the shared supporting
pane. The duplicate provenance screen is retired. Its old design URL redirects within the preview
to the actual Wiki page; production contains no prototype route. Generic DesignComparison still
accepts supplied design alternatives.
