# The kit

The app's component kit, imported from branch `ui-kit` at `2c30183`. Its reference design is in
`design/`. Product, shared UI and workflow screens compose `index.ts`; no public component takes
`className` or `style`. Tailwind scans only this folder.

`npm run kit` opens the standalone gallery, using the same local fonts and theme as the app. The
reference screens illustrate the design; they do not register app features.

| Where | What |
|---|---|
| `index.ts` | public components, icons and theme controls |
| `parts/`, `hooks/` | private shadcn primitives and their hooks |
| `app.tsx` | spacing, typography, pages, sidebar, mobile frame, overlays |
| `navigation.tsx` | `NavigationSuite`: one navigation as a sidebar or a bottom bar |
| `conversation.tsx` | mobile agent screen, desktop reading column, composer and message presentation |
| `screens.tsx` | mobile search screen and history touch rows, desktop palette and commit list |
| `settings.tsx` | mobile full-width settings sections and desktop form rows |
| `surfaces.tsx` | gates, preview notice, tool results, panels and unified diffs |
| `chart.tsx`, `diff.tsx`, `map.tsx` | accessible charts, code diffs, lazy map presentation |
| `styles.css`, `theme.tsx` | zinc color tokens, light/dark/system theme |
| `design/` | original canvases and standalone screen references |
| `tests/` | kit markup and theme checks |

Fonts are Geist, Geist Mono and Newsreader, loaded locally from `@fontsource-variable`. Add generic
presentation here and keep domain behavior in its workflow. `tools/layout.test.ts` checks that callers
use public exports and workflows avoid ad hoc styling. Markdown content rendering is a scoped
exception. Maps require `https://tiles.openfreemap.org` in the consuming page's CSP; the current
product does not use maps.

## Desktop and mobile variants

There is no mobile UI and desktop UI. There is one set of components, and each has a shape for each
size class: **compact** (under 768px, a phone) and **expanded** (a desktop or tablet). A phone screen is
the desktop screen rearranged, never a separate design. The model is Material 3's adaptive navigation
(`NavigationSuiteScaffold`: one item list shown as a bar, rail or drawer) and SwiftUI's
`sidebarAdaptable` tab view (one definition, a tab bar on iPhone and a sidebar on iPad).

### Correspondences

Every pair below is one component or one slot, not two designs. A new component either fits a row or
adds one.

| Expanded (desktop) | Compact (phone) | Kit |
|---|---|---|
| Sidebar | Bottom bar, plus the menu sheet it opens | `NavigationSuite` |
| Sidebar list of destinations | Menu sheet rising from the bar | `NavigationSuite` → `NavigationSheet` |
| Sidebar search field (⌘K) | Search icon in the bar | `NavigationSuite` `search` |
| Sidebar footer rows (Settings) | Icons in the bar | `NavigationSuite` `actions` |
| Primary action at the sidebar's foot | Floating control above the bar | `NavigationSuite` `primary` |
| Brand and sync status at the sidebar's top | Header strip | `Brand`, `MobileHeader` |
| Keyboard-hint footer | Not shown | `WorkspaceFrame` `hints` |
| Page header at the top of the reading column | Bordered header strip | `PageHeader` |
| Dialog | Bottom drawer | `Overlay` |
| Side panel (≥1280px) or dialog | Full-screen sheet | `ConversationPanel` |
| Labelled toolbar buttons | Icon buttons with an `aria-label` | `ConversationSurface` |
| Form rows: label left, control right | Full-width sections | `SettingsPage`, `SettingField` |

**Navigation is declared once.** The product lists every place as data (`Navigation` in
`ui/command.ts`). A *destination* (the default) is a place in a list that may grow without limit: the
agent, history, a note, a calendar. An *action* (`kind: 'action'`) is one of the few controls every
screen keeps; it is in the bottom bar, so keep actions to three or fewer. `Frame` hands both lists to
`NavigationSuite`, which picks the shape. Adding a feature means adding an entry, not editing two
layouts.

### How a shape is decided

What differs between size classes is decided at three levels, and a component uses the lowest one
that works:

1. **Tokens (CSS only).** Type roles carry a phone value and a desktop value in `styles.css`; a
   component writes `text-display`, never `text-[40px]` or `md:text-…`. Body copy and labels have one
   size: text on a phone never shrinks.

   | Role | Phone | Desktop | For |
   |---|---|---|---|
   | `text-display` | 32 | 40 | a serif page title, the agent's welcome |
   | `text-title` | 22 | 26 | a sans page title |
   | `text-lead` | 17 | 19 | long-form serif prose |
   | `text-copy` | 15 | 15 | body text |
   | `text-label` | 13 | 13 | secondary text, rows, suggestions |
   | `text-caption` | 12 | 12 | metadata, hints, speaker names |

   Controls keep shadcn's `text-sm` (14). Keycaps, counts and citation marks are 11px glyph chips.
   Radii have roles and don't change by device: `rounded-md` controls, `rounded-lg` fields,
   `rounded-xl` cards and rows, `rounded-2xl` docked surfaces such as the composer.
2. **Pointer, not width.** Touch sizing follows `pointer-coarse:`, so a touch laptop or tablet gets
   44px targets too. `Button` does this for every size but `xs`; custom rows add
   `min-h-9 pointer-coarse:min-h-11`.
3. **Structure (`useIsMobile`, the size class).** Only when the arrangement itself differs, which is
   every row of the table above. Both shapes take the same props, use the same roles and show the
   same copy; only the kit branches, never a workflow.

Responsive presentation is owned by the kit. Conversation state stays in the chat workflow; the
workspace, feed and composer keep stable positions in the React tree across viewport changes.
Mobile has a brand/status header, icon toolbar, edge-to-edge live transcript, footer navigation with
an independent floating microphone, optional keyboard composer, separate prompt strip, full-screen
agent and search overlays, and bottom-sheet navigation. Desktop has the sidebar, reading column, labeled
actions, keyboard hints and a side panel. Settings and history use device-specific form and list
compositions. The breakpoint is 768px; desktop side panels start at 1280px.

OpenAI WebRTC capture, transcript reconciliation and microphone lifecycle belong to the chat workflow.
The kit presents voice states and actions without accessing microphone permissions or credentials.
