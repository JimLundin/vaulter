# Vaulter

A voice-first personal knowledge wiki, built as a small kernel plus extensions (the project is Pip; the
app is still Vaulter). The design is `ARCHITECTURE.md`. This is a full rebuild: the previous app, a
viewer over the `JimLundin/vault` repo, is in `main`'s history before the `pip` branch.

## Layout

| Where | What |
|---|---|
| `src/kernel/` | the kernel: contracts and definitions, the resolver, the broker, secrets, the in-browser compiler and loader, start-up and safe mode. The only code that is built |
| `src/main.ts`, `index.html` | the kernel bundle's entry, with the modules every extension shares |
| `contracts/<name>/` | one contract each: its interface, Zod schemas for every input, and (for `records`) a conformance suite providers run |
| `extensions/<id>/` | one extension each, exporting `defineExtension({...})`; compiled in the browser from the repo at startup |

The extensions now: `shell` (the frame), `store-idb` (records in IndexedDB), `notes` (the append-only log),
`wiki` (curated pages that cite notes), and the bootstrap source providers `source-github` and
`source-dev`, the only two bundled into the kernel.

An extension imports the kernel as `@pip/kernel`, a contract as `@contracts/<name>`, its own files
relatively, and the shared `zod`, `react`, `react/jsx-runtime` and `react-dom/client`; nothing else. Views
use plain semantic HTML, which the shell styles: there is no build step for an extension's CSS.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the working tree: the kernel compiles `extensions/` and `contracts/` as Vite serves them |
| `npm run build` | the kernel bundle into `dist/` |
| `npm test` / `npm run typecheck` | Vitest (`src/`, `contracts/`, `extensions/`) and TypeScript over all three |
| `npm run lint` / `npm run format` | Biome: check (CI), or fix in place. 2 spaces, single quotes, semicolons, trailing commas, 100 columns |

All code is TypeScript with only erasable syntax and `import type` for types (`tsconfig.json`), which is
also what the in-browser compiler (Sucrase) expects.

## Running it

The built app reads extensions from `VITE_PIP_SOURCE` (`owner/repo@ref`, default
`JimLundin/vaulter@main`); safe mode (`?safe`, or whenever no shell starts) changes the repo, branch or
pinned commit per device, turns extensions off, and sets secrets. Secrets are never in the build or the
repo: each device is asked once and keeps them encrypted (a GitHub token is optional for a public repo,
which then has GitHub's lower rate limit).

Every push runs `.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it builds and
deploys `dist/` to GitHub Pages. This repo is public: never commit a secret or anything personal.
