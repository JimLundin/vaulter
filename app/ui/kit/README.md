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
| `surfaces.tsx` | conversation, tool-result, overlay panel and unified-diff presentation |
| `dictation.tsx` | browser speech control |
| `chart.tsx`, `diff.tsx`, `map.tsx` | accessible charts, code diffs, lazy map presentation |
| `styles.css`, `theme.tsx` | zinc color tokens, light/dark/system theme |
| `design/` | original canvases and standalone screen references |
| `tests/` | kit markup and theme checks |

Fonts are Geist, Geist Mono and Newsreader, loaded locally from `@fontsource-variable`. Add generic
presentation here and keep domain behavior in its workflow. `tools/layout.test.ts` checks that callers
use public exports and workflows avoid ad hoc styling. Markdown content rendering is a scoped
exception. Maps require `https://tiles.openfreemap.org` in the consuming page's CSP; the current
product does not use maps.
