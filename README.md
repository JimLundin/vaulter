# Vaulter

A voice-first personal knowledge wiki, built as a small kernel plus extensions; Vaulter is also the
agent inside it. The design is `ARCHITECTURE.md`; the words it uses are in `CONTEXT.md`. This is a full
rebuild: the previous app, a viewer over the `JimLundin/vault` repo, is in `main`'s history before the
`pip` branch.

## Layout

| Where | What |
|---|---|
| `src/kernel/` | the kernel: importing the extensions a device has on (`kernel.ts`), errors, one tab at a time, starting in the browser (`start.ts`) |
| `src/main.ts` | the page's entry: every extension's `about.ts`, and its `index.ts` as a lazy import |
| `contracts/<name>/` | one contract each: its TypeScript interface, the Zod schemas both sides share, and a conformance suite if providers have one to pass |
| `extensions/<id>/` | one extension each: `index.ts`, an ES module, and `about.ts`, read first |
| `tools/` | CI only: `seal-secrets.ts`, which seals the secrets into the built page |

Extensions: `store-local` (`#records`), `secrets` (`#net`), `notes`, `questions`, `openai` (`#chat`),
`wiki` and `agent` (Vaulter itself); `ARCHITECTURE.md` has a table of what each exports and imports. An
extension imports another by what it provides (`#records`, `#chat`…, named in `package.json`'s
`imports`), a contract as `#contracts/<name>`, the kernel as `#kernel`, and its own files relatively.
The UI, and with it the shell, comes next; until a shell is installed the page says so.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the working tree |
| `npm run build` | the page into `dist/`, each extension a chunk of its own |
| `node tools/seal-secrets.ts <out>` | seal the secrets from the environment (what CI runs; see ARCHITECTURE.md, "Secrets") |
| `npm test` / `npm run typecheck` | Vitest (`src/`, `contracts/`, `extensions/`) and TypeScript over all three |
| `npm run lint` / `npm run format` | Biome: check (CI), or fix in place. 2 spaces, single quotes, semicolons, trailing commas, 100 columns |

All code is TypeScript with only erasable syntax and `import type` for types (`tsconfig.json`). Tests
start the app the way the page does, on fresh modules each time (`startApp` in `src/kernel/testing.ts`),
so starting again within a test is the page's next start; a fixture extension is an about and its
exports. Every contract's conformance suite runs against every extension in the repo that provides it
(`contracts/conformance.test.ts`).

## Running it

An extension is on unless this device turned it off, and a preview is off until it is turned on;
`?reset` forgets this device's choices. Secrets (the `secrets` extension) are sealed into the build by
CI with a password (`VAULTER_PASSWORD`, `VAULTER_SALT`, `VAULTER_SECRET__<EXTENSION>__<NAME>`); each
device asks for the password once and keeps its own encrypted copy.

Every push runs `.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it builds and
deploys `dist/` to GitHub Pages. This repo is public: never commit a secret or anything personal.
