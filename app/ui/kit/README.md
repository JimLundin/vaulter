# The kit

The app's component kit, imported from branch `ui-kit` at `2c30183`. Its reference design is in
`design/`. Product, shared UI and workflow screens compose `index.ts`; no public component takes
`className` or `style`. Tailwind scans only this folder.

`npm run kit` opens the live catalogue, using the same local fonts and theme as the app. Every
public presentation component appears in a component family with an 800px desktop sample beside a
390px touch sample. Both run the same sample implementation. Search by component or family name;
on narrow screens, each comparison scrolls horizontally. Reference screens remain design artifacts.

`catalogue.tsx` contains the sample data and component coverage. `tools/catalogue.test.ts` compares
its registrations and rendered JSX against all public component exports, so adding a component
without a live example fails CI. `tools/layout.test.ts` rejects intrinsic JSX, styling props (including
object spreads), intrinsic element factories, private kit imports and direct presentation dependency
imports throughout Product, shared UI and workflows. Semantic forms use the public `Form` component.
Markdown/HAST rendering and the vault-link annotation transform remain the explicit content exception.

| Where | What |
|---|---|
| `index.ts` | public components, icons and theme controls |
| `catalogue.tsx`, `gallery.tsx` | live examples, component coverage, search and paired catalogue |
| `presentation.tsx` | private bounded presentation and portal target for live samples |
| `parts/`, `hooks/` | private shadcn primitives and their hooks |
| `app.tsx` | spacing, typography, pages, sidebar and mobile frame |
| `overlay.tsx` | one dialog tree, centered or bottom-aligned; full-screen search in compact space |
| `sheet.tsx` | shared menu drawer, centered in expanded space and draggable from the bottom in compact space |
| `navigation.tsx` | `NavigationSuite`: one navigation as a sidebar or a bottom bar |
| `conversation.tsx` | mobile agent screen, desktop reading column, composer and message presentation |
| `screens.tsx` | mobile search screen and history touch rows, desktop palette and commit list |
| `settings.tsx` | feature-named settings menu and shared form rows |
| `surfaces.tsx` | gates, preview notice, tool results, panels and unified diffs |
| `chart.tsx`, `diff.tsx`, `map.tsx` | accessible charts, code diffs, lazy map presentation |
| `styles.css`, `theme.tsx` | zinc color tokens, light/dark/system theme |
| `design/` | original canvases and standalone screen references |
| `tests/`, `tools/browser/` | markup/theme checks and browser interaction coverage |

Fonts are Geist, Geist Mono and Newsreader, loaded locally from `@fontsource-variable`. Add generic
presentation here and keep domain behavior in its workflow. `tools/layout.test.ts` checks that all app
views compose public exports and avoid ad hoc styling. Markdown content rendering is a scoped
exception. Maps require `https://tiles.openfreemap.org` in the consuming page's CSP; the current
product does not use maps.

## Desktop and mobile variants

Mobile and desktop are the **same UI, resized and rearranged**. Components share their content,
state, actions and design roles. Compact space stacks and moves those same pieces; expanded space
spreads them out. Text labels can collapse to accessible icons; the message field stays visible in
both arrangements without introducing different features or a second product design.

The size classes are **compact** (under 48rem), **expanded** (48rem and up), and **wide** (80rem and
up, enough for a side panel). Width and input method are independent: a wide screen may use touch.
The model is Material 3's adaptive navigation
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
| Optional primary sidebar control | Optional floating control above the bar | `NavigationSuite` `primary` |
| Brand and sync status at the sidebar's top | Header strip | `Brand`, `MobileHeader` |
| Page header at the top of the reading column | Bordered header strip | `PageHeader` |
| Centered dialog | Bottom-aligned dialog | `Overlay` |
| Settings dialog over the current feature | Settings drawer, sharing Menu's surface | `SettingsMenu` → `MenuSheet` |
| Side panel (wide) or centered dialog | Full-screen dialog | `ConversationPanel` |
| Labelled toolbar buttons | Icon buttons with an `aria-label` | `ConversationSurface` |
| Form rows: label left, control right | The same fields stacked vertically | `SettingsMenu`, `SettingField` |
| One-row composer with trailing controls | Always-visible field and send control beside the circular microphone | `ConversationSurface`, `Composer`, `ComposerActions` |
| History rows with labelled Revert | The same rows with an icon for Revert | `HistoryEntry` |
| Wrapping prompt strip | Horizontally scrolling prompt strip | `PromptSuggestions` |

**Navigation is declared once.** The product lists every place as data (`Navigation` in
`ui/command.ts`). A *destination* (the default) is a place in a list that may grow without limit: the
agent, history, a note, a calendar. An *action* (`kind: 'action'`) is one of the few controls every
screen keeps. The bottom bar keeps the first three actions beside Menu and Search; additional
actions move into the menu. Ordinary bar controls are square and icon-only; the voice action floats
above them as a circle. `Frame` hands both lists to `NavigationSuite`, which picks the shape. Adding a feature means adding an entry, not editing two
layouts.

**Feature preferences are assembled once.** `SettingsMenu` takes `{ name, content }` entries from
Product, using each name as its section heading. Fields and persistence remain in the feature's
settings view; the kit owns grouping and arrangement. Appearance stays an application section.
Settings opens over the current destination without changing its route or discarding its draft.
`FeaturePage` centers History and other screens on the same `--reading-width` as Agent. Page text
remains left aligned within that centered column.

### Live comparisons

The gallery does not embed another document. CSS responsive utilities query the nearest named
`kit` container: the browser body for the app, or the sample canvas in the catalogue. The private
presentation scope supplies the matching React size class and bounds viewport-sized pieces and
portals to that canvas. Touch policy is explicit in the phone sample and follows the actual pointer
in the app. Sample dialogs remain local and do not lock or hide the catalogue; production modal
focus, scroll locking and focus return still use the normal browser behavior. These previews show
layout and control behavior; they do not simulate a phone browser keyboard or microphone.

### How a shape is decided

What differs between size classes is decided at three levels, and a component uses the lowest one
that works:

1. **Tokens (CSS only).** Type roles carry a phone value and a desktop value in `styles.css`; a
   component writes `text-display`, rather than choosing its own pixel sizes. Body copy and labels
   have one size: text on a phone never shrinks.

   | Role | Phone | Desktop | For |
   |---|---|---|---|
   | `text-display` | 32 | 40 | a serif page title, the agent's welcome |
   | `text-title` | 22 | 26 | a sans page title |
   | `text-lead` | 17 | 19 | long-form serif prose |
   | `text-copy` | 15 | 15 | body text |
   | `text-label` | 13 | 13 | secondary text, rows, suggestions |
   | `text-caption` | 12 | 12 | metadata, hints, speaker names |

   Controls use `text-control` / `text-sm` (14). Fields use `text-field` (14 with a mouse, 16
   when touch is available, preventing mobile focus zoom). Keycaps, counts and citations use
   `text-glyph` (11). `--page-inset` and `--page-block` resize spacing centrally;
   `--reading-width` gives feature screens one centered content width. The composer stays 44px high
   inside a 54px surface at every size, with controls beside the field. Long drafts and explicit
   newlines scroll inside that single row.
   Radii have roles and don't change by device: `rounded-md` controls, `rounded-lg` fields,
   `rounded-xl` cards and rows, `rounded-2xl` docked surfaces such as the composer.
2. **Pointer, not width.** `styles.css` applies a 44px minimum target whenever **any pointer** is
   coarse, including touch desktops. It covers all button sizes, checkboxes, inputs, grouped inputs,
   tabs, toggles, command/menu rows, sidebar controls, dialog close buttons and map controls.
   Checkboxes keep a 16px mark inside the target. Chart marks scroll horizontally when there are
   too many touch targets to fit, and map markers keep their small visual inside a larger target.
   Custom standalone controls opt in with
   `data-touch-target`; inline prose links and citations retain their line boxes.
3. **Structure (`useLayout`, the size class).** Only when the arrangement itself differs, which is
   every row of the table above. Both shapes take the same props, use the same roles and show the
   same copy; only the kit branches, never a workflow. `useLayout` reads the breakpoint tokens
   emitted by Tailwind, so CSS and React share the thresholds; the gallery supplies its local presentation class. Product may
   use the size class to choose a route or restore a panel; workflow views do not query the viewport.

Responsive presentation is owned by the kit. Conversation state stays in the chat workflow; the
workspace, feed, composer, settings fields, history rows and open search/review/panel contents
keep stable positions in the React tree across viewport changes. Focus and uncontrolled fields survive
rearrangement. Modal surfaces trap focus, Escape dismisses the topmost surface, and closing returns
focus to the opening control or its equivalent in the new arrangement. Navigation closes its menu
when expanding into a sidebar.
Mobile has a brand/status header, icon toolbar, edge-to-edge live transcript, footer navigation with
a circular microphone beside the always-visible message field, separate prompt strip, full-screen
agent and search overlays, and bottom-sheet navigation. Desktop has the sidebar, reading column, labeled
actions and a side panel. Desktop content uses the full height without a shortcut footer. Search
keeps its shortcut badge; all shortcuts remain available through Search and `?`.
Settings shares Menu's bottom drawer on mobile and centers
as a dialog on desktop; the same feature-named sections rearrange inside it. History uses shared list
compositions. The thresholds live in `styles.css`; React reads the same emitted CSS tokens. The
workspace and full-screen dialogs follow `visualViewport` so a mobile keyboard can reduce their available height.
The message field is present before focus and stays one row high while typing. Other feature pages
retain the floating voice action above the footer.

OpenAI WebRTC capture, transcript reconciliation and microphone lifecycle belong to the chat workflow.
The kit presents voice states and actions without accessing microphone permissions or credentials.

## Verifying a kit change

Run `npm run typecheck`, `npm test`, `npm run lint` and `npm run test:ui`. Install Chromium once with
`npx playwright install chromium` (`--with-deps` on Linux CI). The browser suite starts its own sample
server on port 4179 and leaves the design-review server on 4178 running. It uses the public kit fixture
at `tests/browser.html` and the sample preview, with no private vault or paid API.

The suite runs at phone, desktop and touch-desktop sizes. Catalogue coverage checks paired samples,
independent drafts, scoped settings/search/menu portals, component search, CSS and touch density
independent of outer browser size, and no iframe or automatic external service requests. It checks
touch targets, navigation/current state, centered feature columns, feature-named settings drawers, growing action lists, keyboard
tab/checkbox behavior, Escape and focus return, search selection
and drafts through size changes, the mobile field/microphone row before and after focus,
Enter/Shift+Enter/IME, and a simulated visual
viewport resize. A physical phone keyboard and microphone still need device validation.
