# The app

The browser app Jim reads the vault in, at **https://jimlundin.github.io/vaulter/**. It holds no notes:
behind a password it reads them at runtime from the vault, the private repo `JimLundin/vault`, keeps
them encrypted on the device, and works offline. Notes never depend on anything here except the MDX
components (the vault's `meta/conventions.md` §13). The design and its history: `PLAN-browser-app.md`
(written while the app still lived in the vault, as `site/`, and the repos were `my-vault` and `vault-pages`).

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run check` | the vault's check (`tools/check.ts`) over `../vault` (or `node tools/check.ts --vault <dir>`): links, heading anchors, wikilinks, raw HTML, what MDX may contain (`core/mdx-rules.ts`), and the vault's schema (`meta/schema.yaml`, held to it by `core/schema.ts` and `core/relations.ts`). Fast; run before every push to the vault. The vault's CI runs it on every push too, from this repo's `main` |
| `npm run dev` | the app on a vault folder you pick (`app/backends/folder.ts`, Chromium only), live: edits to notes show without a reload; no password, no Node at runtime |
| `npm run build` | the app into `dist/` |
| `npm run lint` / `npm run format` | Biome: lint and format check (CI), or fix both in place. Style: 2 spaces, single quotes, semicolons, trailing commas, 100 columns (`biome.json`) |
| `npm test` / `npm run typecheck` | the tests (Vitest: `app/`, `core/`) and TypeScript over `app/`, `core/` and `tools/` |
| `node tools/seal-secrets.ts <out>` | seal the token and key with the password from the environment (what CI runs; see Publishing) |

With this repo cloned next to the vault (`../vaulter`) and `npm ci` run in it, from the vault root:
`node ../vaulter/tools/check.ts` (the check), `node ../vaulter/tools/audit.ts` (the weekly
sweep's report, changes nothing), `node ../vaulter/tools/set-ext.ts "Note" md|mdx` (switch a
note's extension and rewrite every link to it) and `node ../vaulter/tools/capture.ts --source … --procedure …
--summary … --topic … < turns.md` (append a Capture's exchange to the day's log, collecting the time, machine,
session and weather itself). Each takes `--vault <dir>`, default the working directory.

All code is TypeScript. Node 24 runs the scripts directly (type stripping), so only erasable syntax,
explicit `.ts` imports and `import type` (enforced by `tsconfig.json`).

## Where the rules live

- `meta/schema.yaml` (in the vault) — the vocabulary: note types, facet values, broad topics, relation
  predicates (with when to use each), the MDX components notes may use. The app reads it at runtime.
- `core/schema.ts` — reads and validates it (`schemaOf`); frontmatter fields, structure rules.
- `core/relations.ts` — the checks for `relations`, `dates`, `follow-ups`, `decisions`, `geo`,
  `address`, `where`.
- `core/mdx-rules.ts`, `core/safe-url.ts` — what a note may contain beyond Markdown: the three
  components with literal props, and relative, `http(s)`, `mailto` and `tel` links. Notes are data, never code.

## How it fits together

The design, its rules and how to add a feature: `ARCHITECTURE.md`. In short:

- `core/` — the vault model, pure (no DOM, no Node): parse (`vault.ts`), check (`check.ts`), derive
  (`derive.ts`, plus `facts.ts`, `vault-map.ts`, `similar.ts`, `brief.ts`, `audit.ts`, `rename.ts`),
  vocabulary (`schema.ts` over `meta/schema.yaml`), formats (`format.ts`), secrets (`sealed.ts`), the
  day's capture log (`capture.ts`: one per day, its exchanges' metadata in the frontmatter), weather (`weather.ts`).
- `app/shell/` — the shell: `App.tsx`, routing, the top bar and search, the extension host (`host.tsx`,
  `extension.ts`), the session and backends contract (`session.ts`, `backend.ts`), the writer
  (`writer.ts`), the encrypted IndexedDB (`store.ts`), unlocking (`unlock.ts`), rendering
  (`markdown.ts`, `highlight.tsx`), the worker and the service worker.
- `app/backends/` — GitHub (`github/`: the REST client, sync through the encrypted cache, commits through
  the Git Data API), a picked folder (`folder.ts`, Chromium only), memory (`memory.ts`, for tests).
- `app/extensions/` — every feature, listed in `extensions/index.ts`: notes, home, topics, calendar,
  decisions, map, similar, places, editor (edit, rename, changes, history), audit, agent, code (the
  agent's tools over this repo, so the app can change itself), web (search and reading pages, through Jina).
- `tools/` — the only Node: `check.ts` (CI), `seal-secrets.ts` (publishing), `audit.ts`, `set-ext.ts`
  and `capture.ts` (command-line sessions), over `core/`.

Security: notes render without eval (MDX props are literals), raw HTML and unsafe URLs are dropped, the
page has a CSP (script only from the app; network only to GitHub, OpenAI, Jina, the map tiles, and for a capture's metadata OpenStreetMap's geocoder and open-meteo), the cache is
encrypted with a per-device key, and every commit from the app passes the check and carries
`Committed-From: vault app`.

## Publishing

Notes don't publish: the app reads the vault's `main` itself. Every push here runs
`.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it then builds, seals
`dist/secrets.json` from this repo's secrets, and deploys `dist/` to GitHub Pages (Settings → Pages →
Source: GitHub Actions). This repo is public: never commit a `secrets.json`, notes, or anything personal
(test fixtures and examples are fictional).

The vault's own CI (`vault/.github/workflows/check.yml`) checks out this repo's `main` and runs its
check over the notes, so a change to the rules here applies to the vault's next push.

What the seal needs, in this repo's settings:

| | Kind | What |
|---|---|---|
| `VAULT_PASSWORD` | secret | the app's password (12+ characters; long and random is best: the sealed file is public) |
| `VAULT_GITHUB_TOKEN` | secret | a fine-grained PAT for `vault` and `vaulter` only (Contents read/write, Metadata read), with an expiry; `vaulter` is for the agent changing the app (`app/extensions/code/`) |
| `VAULT_OPENAI_KEY` | secret | optional: the agent's key, from a project with a spend limit |
| `VAULT_JINA_KEY` | secret | optional: the agent's web search (jina.ai); reading pages works without it, at a lower rate |
| `VAULT_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`); set once |
| `VAULT_OPENAI_API` | variable | optional: the agent's OpenAI-compatible endpoint (an API proxy); empty means api.openai.com |
| `VAULT_REPO` | variable | optional: the vault the app reads, `owner/name@branch`; default `JimLundin/vault@main` |

A new token or key: update the secret and run the workflow (Actions → Deploy → Run workflow);
devices stay signed in. To sign every device out, change `VAULT_SALT` (or the password) and run it.
