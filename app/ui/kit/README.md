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

A component has one name and, where needed, two placements. What differs between devices is decided
at three levels, and a component uses the lowest one that works:

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
3. **Structure (`useIsMobile`).** Only when the arrangement itself differs: a bordered strip vs. the
   top of a reading column (`PageHeader`), a sidebar vs. a navigation sheet, a dialog vs. a drawer.
   Both branches use the same roles and the same copy.

Responsive presentation is owned by the kit. Conversation state stays in the chat workflow; the
workspace, feed and composer keep stable positions in the React tree across viewport changes.
Mobile has a brand/status header, icon toolbar, edge-to-edge live transcript, footer navigation with
an independent floating microphone, optional keyboard composer, separate prompt strip, full-screen
agent and search overlays, and bottom-sheet navigation. Desktop has the sidebar, reading column, labeled
actions, keyboard hints and a side panel. Settings and history use device-specific form and list
compositions. The breakpoint is 768px; desktop side panels start at 1280px.

OpenAI WebRTC capture, transcript reconciliation and microphone lifecycle belong to the chat workflow.
The kit presents voice states and actions without accessing microphone permissions or credentials.
