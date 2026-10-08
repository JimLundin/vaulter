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
| `npm run check` | the vault's check (`tools/check.ts`) over `../vault` (or `node tools/check.ts --vault <dir>`): links, heading anchors, wikilinks, raw HTML, what MDX may contain (`app/extensions/notes/model/mdx-rules.ts`), and the vault's schema (`meta/schema.yaml`, held to it by `app/extensions/notes/model/schema.ts` and `app/extensions/graph/model/relations.ts`). Fast; run before every push to the vault. The vault's CI runs it on every push too, from this repo's `main` |
| `npm run dev` | the app on the vault through GitHub, as built, in any browser, but with no password: it loads right in with the secrets from `.env.local` (gitignored): `VAULT_GITHUB_TOKEN`, and optionally `VAULT_OPENAI_KEY` and `VAULT_JINA_KEY`, the names CI seals. Only dev gets them; a build has none. Its commits go to the vault's `main`, as the app's do |
| `npm run build` | the app into `dist/` |
| `npm run lint` / `npm run format` | Biome: lint and format check (CI), or fix both in place. Style: 2 spaces, single quotes, semicolons, trailing commas, 100 columns (`biome.json`) |
| `npm test` / `npm run typecheck` | the tests (Vitest: `app/`) and TypeScript over `app/` and `tools/` |
| `node tools/seal-secrets.ts <out>` | seal the token and key with the password from the environment (what CI runs; see Publishing) |

The vault is worked in the app: the audit, rename (and switching `.md`/`.mdx`) and Captures are pages
and agent tools there, not scripts.

All code is TypeScript. Node 24 runs the scripts directly (type stripping), so only erasable syntax,
explicit `.ts` imports and `import type` (enforced by `tsconfig.json`).

## Where the rules live

- `meta/schema.yaml` (in the vault) — the vocabulary: note types, facet values, broad topics, relation
  predicates (with when to use each), the MDX components notes may use. The app reads it at runtime.
- `app/extensions/notes/model/` — the notes' rules (`check.ts`): the vocabulary read and validated
  (`schema.ts`), frontmatter fields and structure, the structured fields' shapes (`structured.ts`:
  `relations`, `dates`, `follow-ups`, `decisions`, `geo`, `address`, `where`), and what a note may contain
  beyond Markdown (`mdx-rules.ts`, `safe-url.ts`: the components with literal props; relative, `http(s)`,
  `mailto` and `tel` links). Notes are data, never code.
- `app/extensions/graph/model/check.ts` — the graph's rules: every link and #heading resolves, relations
  are the vocabulary's predicates, every note a field names exists.
- `app/extensions/check.ts` — both together: what `npm run check` and the vault's CI run.

## How it fits together

The design, its rules and how to add a feature: `ARCHITECTURE.md`. In short:

- `app/core/` — the platform, which knows only files: `App.tsx`, routing, the frame and ⌘K (with its
  search engine), the extension host (`host.tsx`, `extension.ts`), the session and the backend contract
  (`session.ts`, `backend.ts`), the writer (`writer.ts`), unlocking and the keys (`unlock.ts`,
  `crypto.ts`, `idb.ts`), the secrets' format (`sealed.ts`), dates (`format.ts`), the worker and the
  service worker.
- `app/backends/` — GitHub (`github/`: the REST client, its encrypted cache, sync, commits through the
  Git Data API), memory (`memory.ts`, for tests).
- `app/extensions/notes/` — the note: `model/` (a file as a note, its fields, links and references, the
  vocabulary, the capture log's format, rename, the rules), the note page and its rendering
  (`markdown.ts`, `highlight.tsx`), the sidebar's Recent.
- `app/extensions/graph/` — the knowledge graph: `model/graph.ts` (backlinks, relations, topics,
  activity, when each note last changed), its check, `useGraph()`.
- `app/extensions/` — the other features, listed in `extensions/index.ts`: home, topics, calendar,
  decisions, map, similar, places, editor (edit, rename, changes, history), audit, agent, code (the
  agent's tools over this repo, so the app can change itself), web (search and reading pages, through
  Jina). Each holds its own logic (the brief in home, the layout in map, …).
- `tools/` — the only Node, for CI: `check.ts` (the vault's check) and `seal-secrets.ts` (publishing).

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
