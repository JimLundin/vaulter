# The app

The browser app Jim reads the vault in, at **https://jimlundin.github.io/vaulter/**. It holds no notes:
behind a password it reads them at runtime from the vault, the private repo `JimLundin/vault`, keeps
them in plaintext on the device, and works offline. Chat and Agent now produce nodes in the shared NodeStore. Search reads Wiki nodes; History reads accepted Node Transactions. The Vault owns [translation and enrichment tooling](https://github.com/JimLundin/vault/tree/main/.vaulter/tooling/migration)
that targets the current Vaulter modules. Its source readers, extraction policy and private review
data evolve in the Vault; Vaulter modules own their current record validation and historical reads.
See [Wiki ingestion](./app/workflows/wiki/README.md) for the boundary and current interfaces.
See [Architecture](ARCHITECTURE.md) for module boundaries and [ADRs](docs/adr/) for accepted decisions.

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run dev` | the app on the vault through GitHub, as built, in any browser, but with no password: it loads right in with the secrets from `.env.local` (gitignored): `VAULT_GITHUB_TOKEN`, and optionally `VAULT_OPENAI_KEY`, the names CI seals. Only dev gets them; a build has none. Its commits go to the vault's `main`, as the app's do |
| `npm run kit` | the live component kit gallery |
| `npm run design` | the current branch UI at `http://localhost:5173/preview/`, with fictional notes and scripted chat; no password, keys or vault connection |
| `npm run design:agent` | local preview with the real agent at `/preview/?agent=live`; uses the configured API and token through the Vite server, with fictional data and local tool writes |
| `npm run build:design` | the sample preview and component gallery into `dist-preview/` |
| `npm run build` | the app into `dist/` |
| `npm run lint` / `npm run format` | Biome: lint and format check (CI), or fix both in place. Style: 2 spaces, single quotes, semicolons, trailing commas, 100 columns (`biome.json`) |
| `npm test` | both Vitest projects in CI; requires a focused selection locally |
| `npm run test:fast` / `npm run test:watch` | behavior tests once, or watch; requires a module path or test filter locally |
| `npm run test:architecture` | module import rules, kit composition and catalogue coverage; select a checker locally |
| `npm run test:ui` / `npm run test:ui:matrix` | audited browser coverage, or all three profiles; select a spec or test name locally |
| `npm run test:production` | built application acceptance on desktop and phone; select a spec or test name locally |
| `npm run test:all` | complete routine verification, CI only |
| `npm run typecheck` | TypeScript over the app, tools and Vite/Vitest/Playwright configurations |
| `node tools/build/seal-secrets.ts <out>` | seal the token and key with the password from the environment (what CI runs; see Publishing) |

Application composes node-backed Chat, independent Agent and module-owned content tools. Content
publication records immutable node history and attributed tool receipts; failed saves are recoverable
without repeating effects. All application reads and writes use node storage.
Consecutive tool calls fold into an expandable summary, with a live status showing the current action.
The app includes a manifest and icons for installing it to the Home Screen.
Questions collects retained requests for information, with search and Open, Answered, Abandoned
and All filters. The agent can ask a question about a Wiki page or section, where the same question
also appears. Answer from either view; the response and its evidence link are saved together and
remain readable after reload. The agent can consult retained questions and answers on later turns.
Settings groups Appearance, Chat instructions, Agent execution options, OpenAI models and voice,
and GitHub storage. Preferences apply to new runs and are saved on this device.
Models, voice, step limits, output limits and retry counts offer dropdown choices with custom values.
Login-preloaded keys show their configured status. Replace them, restore their login values, or clear
optional keys with explicit actions; production credential overrides are encrypted on the device and
removed by sign-out. Replacing the GitHub token reconnects storage before activating it. The API
endpoints and vault repository show the installation's build configuration. Enter sends an agent
message; Shift+Enter adds a new line. Both devices use the same always-visible one-row message
field with inset microphone and Send controls. Tap the microphone to dictate into that field,
tap again to finish, then edit or submit with Send or Enter. Speech appends to any existing draft;
starting another recording appends more words. The field follows incoming words without opening
the phone keyboard. Suggested prompts live in a separate strip and open an editable draft.
Other feature pages keep a floating microphone above the icon-only phone footer.

Live transcription uses OpenAI's transcription-only WebRTC session with `gpt-live-transcribe` and
the already-unlocked OpenAI key. Partial deltas print immediately; final text replaces the partial
draft before sending. If the configured API lacks Realtime endpoints, chat records audio locally
and transcribes it when you tap Finish, using the File transcription model from Settings. Foundry
defaults to its supported `gpt-4o-transcribe`. Recording does not submit a message. Audio goes to
OpenAI only after starting the microphone; it is not stored in the vault. Errors and interruptions preserve partial text for
editing. The sample preview uses a
scripted transcript and makes no microphone or model requests.

Opening `/chat/` starts with an empty conversation. Saved conversations load 20 at a time, most
recently active first; Load older conversations brings in the next 20. Selecting a conversation
or saving a message updates its URL so reload reopens that history. New returns to `/chat/`, and
reload keeps it empty. Merely opening Chat does not create a saved conversation.

All code is TypeScript. Node 24 runs the scripts directly (type stripping), so only erasable syntax,
explicit `.ts` imports and `import type` (enforced by `tsconfig.json`).

## Project layout

Use the [testing guide](docs/agents/testing.md) for focused local checks, test placement,
device coverage and verification of the pushed commit in CI.

`app/application/` composes the optional workflows in `app/workflows/`. Its `index.tsx` owns the shell
and views; `composition.ts` connects record readers, tools and publication rules. Each task owns its behavior,
views and tests. Removing a feature means deleting its folder and its wiring in Application. The
permanent `app/vault/` module owns node history, transaction validation, credential encryption and scoped writes.
Wiki and Questions share Node references without importing one another. Agent selects their
connections, and Application supplies embedded record rendering. Generic controls live in
`app/ui/kit/`; Settings, Navigation, Search and Runtime own their respective application behavior.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map, ownership and dependency rules.

The app uses the [component kit](app/ui/kit/README.md) in `app/ui/kit/`. Run
`npm run kit` to open its searchable catalogue, with live desktop and mobile examples side by side.
Every public component must have an example; CI checks coverage and app-wide kit composition.
Workflow views compose its public components; styles stay in the kit, with a scoped exception for Markdown rendering. `tools/architecture/layout.test.ts` enforces the import rules
in CI, including dynamic imports and aliases.

Node transactions enforce structural integrity and each supplying module validates its own content.

## Central node storage

The central NodeStore contract supports immutable versions, atomic transactions, grouped placement
and connection values, and identity or exact-version references. GitHub persistence writes one
transaction envelope into the private vault's `.vaulter/nodes/v1/transactions/` namespace and uses
a plaintext Dexie device cache. Node-backed Chat accepts its message
and initial Agent run together, while Agent can also execute independently of conversations. Modules
choose their tools and publication rules. Generic History reads expose records, cutoffs and differences
without running producers; Application composes Agent/Chat/content preservation for compensation. The
History screen reads node transactions and Search uses Wiki page entries. See [Agent records](./app/agent/README.md),
[Chat nodes](./app/workflows/chat/README.md) and [Vault](./app/vault/README.md)
for target layouts, recovery, acceptance and current limits.

## Publishing

Every branch push runs CI. Non-main branches publish a sample preview at
`/preview/<branch-name>/`, with the gallery at `/preview/<branch-name>/kit/`; `main` publishes
production. Review and promotion follow the [preview guide](docs/agents/preview.md), including
checking the preview and production `version.json` commits.

It uses the actual current Application views, fictional notes, an in-memory backend,
and a scripted local model. Try “vault it: leave space for a walk before work” to create, read and
update a fictional content node through the actual Agent. Reload reopens accepted Chat history without
replaying tools; Reset demo clears its tab journal. Try “ask me: Which tools should stay?” to save a
question about Garden studio, then answer it from Questions or the Wiki page.
Query scenarios `initial-save`, `lost-response`,
`outcome-save` and `terminal-save` demonstrate persistence recovery. It ships no credentials, reads
no private vault contents, and registers no service worker. Search opens the current Wiki page routes.

To test the real agent locally, run `npm run design:agent`. Set `VAULT_OPENAI_API` and
`VAULT_OPENAI_MODEL` in the root `.env.local` (gitignored), and supply `VAULT_OPENAI_KEY`,
`OPENAI_API_KEY`, or the environment's `FOUNDRY_TOKEN`. `OPENAI_BASE_URL` and `OPENAI_MODEL` are
also accepted. A Foundry token requires an explicit API endpoint. The selected model in Settings
overrides the configured default. Restart Vite after changing configuration.

The local live preview streams through a same-origin Vite proxy; the API token stays on the server.
Agent tool calls use the sample NodeStore and its tab journal. Reset demo clears that history.
In live preview, the microphone records in the browser and sends audio for transcription when you
tap Finish. The resulting text appends to your draft for review before Send. This uses
`gpt-4o-transcribe`, supported by the configured Foundry proxy; set
`VAULT_OPENAI_TRANSCRIPTION_MODEL` to override it. The microphone stops before upload, and audio
is not saved in the preview history. Suggested prompts remain scripted. `/preview/` still uses
the scripted model and transcription, and
`build:design` always produces a scripted preview without the live connection or credentials.

GitHub Pages accepts one site artifact. The preview job downloads the successful artifact for the
currently deployed production commit, preserves its root files, and adds `preview/<branch-name>/`.
The workflow retains each sample build as a `design-preview` artifact for 90 days. Packaging
restores other branches' latest available successful preview artifacts before adding the current
branch, so publishing one preview preserves the others.
Production artifacts are retained for 90 days; refresh production before publishing a preview if
the deployed artifact has expired.
`tools/preview/publish-design.ts` refuses to publish if that exact production artifact is unavailable or if
the preview contains `secrets.json` or `sw.js`. The `github-pages` environment permits branch
deployments for these previews. Preview publishing does not merge the application branch or migrate vault data.
Main deployments publish production together with the retained branch previews.

Notes don't publish: the app reads the vault's `main` itself. Every push here runs
`.github/workflows/deploy.yml`: lint, the type check and the tests; on `main` it then builds, seals
`dist/secrets.json` from this repo's secrets, and deploys `dist/` to GitHub Pages (Settings → Pages →
Source: GitHub Actions). This repo is public: never commit a `secrets.json`, notes, or anything personal
(test fixtures and examples are fictional).

What the seal needs, in this repo's settings:

| | Kind | What |
|---|---|---|
| `VAULT_PASSWORD` | secret | the app's password (12+ characters; long and random is best: the sealed file is public) |
| `VAULT_GITHUB_TOKEN` | secret | a fine-grained PAT for `vault` and `vaulter` only (Contents read/write, Metadata read), with an expiry; only the vault is needed by the current workflows |
| `VAULT_OPENAI_KEY` | secret | optional: the agent's key, from a project with a spend limit |
| `VAULT_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`); set once |
| `VAULT_OPENAI_API` | variable | optional: the agent's OpenAI-compatible endpoint (an API proxy); empty means api.openai.com |
| `VAULT_REPO` | variable | optional: the vault the app reads, `owner/name@branch`; default `JimLundin/vault@main` |

A new token or key: update the secret and run the workflow (Actions → Deploy → Run workflow);
devices stay signed in. To sign every device out, change `VAULT_SALT` (or the password) and run it.
