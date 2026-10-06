# Vaulter

A voice-first personal knowledge wiki, built as extensions that import one another; Vaulter is also the
agent inside it. The design is `ARCHITECTURE.md`, the words it uses are in `CONTEXT.md`, and how the
code is written is `STYLE.md`. This is a full rebuild: the previous app, a viewer over the
`JimLundin/vault` repo, is in `main`'s history before the `pip` branch.

## Layout

| Where | What |
|---|---|
| `src/main.ts` | the page's entry: claims the tab, then has the core start every extension |
| `src/core/` | the core (`#core`): what an extension offers (`Operation`, `Extension`), and `extensions()`, which starts and collects every one |
| `extensions/<id>/` | one extension each: `index.ts`, an ES module, and `api.ts`, the schemas and data types others use |
| `tools/` | CI only: `seal-secrets.ts`, which seals the secrets into the built page |
| `tests/` | every test, by what it tests (`tests/extensions/<id>/`), and `app.ts`, which restarts the app in a test |

Extensions: `storage` (records, over Dexie), `secrets`, `notes`, `questions`,
`openai` (the model, over the AI SDK), `wiki` and `agent` (Vaulter itself); `ARCHITECTURE.md` has a table of what each
exports and imports. An extension imports another as `#extensions/<id>`, and
its own files relatively, and calls what it imports. What it offers a person or Vaulter it exports as
`extension`, which the core collects: the agent reads every extension's operations there, and the
shell will read each one's `ui` (ARCHITECTURE.md, "The core"). The shell comes
next, with the UI work; until then the page says Vaulter is running.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the working tree |
| `npm run build` | the page into `dist/` |
| `node tools/seal-secrets.ts <out>` | seal the secrets from the environment (what CI runs; see ARCHITECTURE.md, "Secrets") |
| `npm test` / `npm run typecheck` | Vitest (`tests/`) and TypeScript over everything |
| `npm run lint` / `npm run format` | Biome: check (CI), or fix in place. 80 columns; the rest of the style is `STYLE.md` |

All code is TypeScript with only erasable syntax and `import type` for types (`tsconfig.json`). Tests
start the app the way the page does, on fresh modules each time (`restart` in `tests/app.ts`),
so starting again within a test is the page's next start; a fixture extension is just its exports.

## Running it

Every extension on `main` runs; a new one is tried in its pull request's preview build. Secrets (the
`secrets` extension) are sealed into the build by CI with a password (`VAULTER_PASSWORD`, `VAULTER_SALT`,
`VAULTER_SECRET__<EXTENSION>__<NAME>`); each device asks for the password once and keeps the key to
open them.

Every push runs `.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it builds and
deploys `dist/` to GitHub Pages. This repo is public: never commit a secret or anything personal.
