# Vaulter

A voice-first personal knowledge wiki, built as a small kernel plus extensions (the project is Pip; the
app is still Vaulter). The design is `ARCHITECTURE.md`; the words it uses are in `CONTEXT.md`. This is a full rebuild: the previous app, a
viewer over the `JimLundin/vault` repo, is in `main`'s history before the `pip` branch.

## Layout

| Where | What |
|---|---|
| `src/kernel/` | the kernel: the loader and compiler, the resolver, the handles and their policy (Pip's access, approvals), secrets (sealed ones too), storage, drafts, the `kernel` contract's implementation, boot (`boot.ts`, with this browser as its device in `start.ts`), the unlock screen and safe mode. Built into the app's one bundle |
| `tools/` | CI only: `seal-secrets.ts`, which seals the secrets into the built page |
| `contracts/<name>/` | one contract each: its interface, Zod schemas for every input, a client when the wire needs adapting, and a conformance suite every provider must pass |
| `extensions/<id>/` | one extension each, exporting `defineExtension({...})`; compiled in the browser from the repo and loaded into the page |

Contracts: `kernel` (provided by the kernel), `extensions.source`, `records`, `notes`, `questions`,
`wiki`, `agent`, `agent.tools`, `ai.chat`, `ai.transcribe`, `ai.realtime`, `ai.embed`. Extensions:
`source-github` (the only one the kernel bundle ships), `store-local`, `notes`, `questions`, `openai`,
`wiki` and `agent` (Pip); `ARCHITECTURE.md` has a table of what each provides and requires. The UI,
and with it `ui.shell`, comes next; until a shell is installed the app opens in safe mode, where the
OpenAI key is set.

An extension imports the kernel as `@pip/kernel`, a contract as `@contracts/<name>`, its own files
relatively, and the shared `zod`, `react`, `react/jsx-runtime` and `react-dom/client`; nothing else.
Every contract method is async, and goes through a kernel handle that checks it (ARCHITECTURE.md,
"Running in the page"). Extensions run in the kernel's page, with no sandbox.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the working tree: the kernel compiles `extensions/` and `contracts/` as Vite serves them |
| `npm run build` | the kernel bundle into `dist/` |
| `node tools/seal-secrets.ts <out>` | seal the secrets from the environment (what CI runs; see ARCHITECTURE.md, "Secrets") |
| `npm test` / `npm run typecheck` | Vitest (`src/`, `contracts/`, `extensions/`) and TypeScript over all three |
| `npm run lint` / `npm run format` | Biome: check (CI), or fix in place. 2 spaces, single quotes, semicolons, trailing commas, 100 columns |

All code is TypeScript with only erasable syntax and `import type` for types (`tsconfig.json`), which is
also what the in-browser compiler (Sucrase) expects. Tests boot the same way as the browser, on a
test device that stands in for one (`src/kernel/testing.ts`: `startTree` for a tree of source strings
as the main branch, with drafts beside it if wanted; `startRepo` for the repo's own extensions;
`conformanceInVitest` for a contract's suite against a provider).

## Running it

The built app reads extensions from `VITE_PIP_SOURCE` (`owner/repo@ref`, default
`JimLundin/vaulter@main`); safe mode (`?safe`, or whenever no shell starts) changes the repo, branch or
pinned commit per device, turns extensions and drafts off, and sets secrets. Secrets are sealed into
the build by CI with a password (`PIP_PASSWORD`, `PIP_SALT`, `PIP_SECRET__<EXTENSION>__<NAME>`); each
device asks for the password once and keeps its own encrypted copy.

Every push runs `.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it builds and
deploys `dist/` to GitHub Pages. This repo is public: never commit a secret or anything personal.
