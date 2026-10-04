# Vaulter

A voice-first personal knowledge wiki, built as a small kernel plus extensions (the project is Pip; the
app is still Vaulter). The design is `ARCHITECTURE.md`. This is a full rebuild: the previous app, a
viewer over the `JimLundin/vault` repo, is in `main`'s history before the `pip` branch.

## Layout

| Where | What |
|---|---|
| `src/kernel/` | the kernel: the loader and compiler, the resolver, the router and its policy (Pip's access, approvals), secrets, storage, sandboxes, drafts, the `kernel` contract's implementation, start-up and safe mode. Built into the app's one bundle |
| `src/sandbox/` | what runs inside every sandbox: the runtime, the linker, the bootstrap. Sent to each sandbox by the kernel |
| `contracts/<name>/` | one contract each: its interface, Zod schemas for every input, a client when the wire needs adapting, and a conformance suite every provider must pass |
| `extensions/<id>/` | one extension each, exporting `defineExtension({...})`; compiled in the browser from the repo and run in its own sandbox |

Contracts: `kernel` (provided by the kernel), `extensions.source`, `records`, `notes`, `questions`,
`agent.tools`, `ai.chat`, `ai.transcribe`, `ai.realtime`, `ai.embed`. Extensions: `source-github` (the
only one the kernel bundle ships) and `store-local` (records@1 on the kernel's storage). The UI, and
with it `ui.shell`, comes next; until a shell is installed the app opens in safe mode.

An extension imports the kernel as `@pip/kernel`, a contract as `@contracts/<name>`, its own files
relatively, and the shared `zod`, `react`, `react/jsx-runtime` and `react-dom/client`; nothing else.
Every contract method is async (it is a message to another sandbox), and values crossing must be
plain: functions become callbacks, and Zod schemas are converted by a contract's client.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the working tree: the kernel compiles `extensions/` and `contracts/` as Vite serves them |
| `npm run build` | the kernel bundle and the sandbox bundles into `dist/` |
| `npm test` / `npm run typecheck` | Vitest (`src/`, `contracts/`, `extensions/`) and TypeScript over all three |
| `npm run lint` / `npm run format` | Biome: check (CI), or fix in place. 2 spaces, single quotes, semicolons, trailing commas, 100 columns |

All code is TypeScript with only erasable syntax and `import type` for types (`tsconfig.json`), which is
also what the in-browser compiler (Sucrase) expects. Tests run extensions in real sandboxes in-process
(`src/kernel/testing.ts`: `startTree` for a tree of source strings, `conformanceInVitest` for a
contract's suite against a provider).

## Running it

The built app reads extensions from `VITE_PIP_SOURCE` (`owner/repo@ref`, default
`JimLundin/vaulter@main`); safe mode (`?safe`, or whenever no shell starts) changes the repo, branch or
pinned commit per device, turns extensions and drafts off, and sets secrets. Secrets are never in the
build or the repo: each device is asked once and keeps them encrypted (a GitHub token is optional for
a public repo, which then has GitHub's lower rate limit).

Every push runs `.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it builds and
deploys `dist/` to GitHub Pages. This repo is public: never commit a secret or anything personal.
