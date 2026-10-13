# The app

The browser app Jim reads the vault in, at **https://jimlundin.github.io/vaulter/**. It holds no notes:
behind a password it reads them at runtime from the vault, the private repo `JimLundin/vault`, keeps
them in plaintext on the device, and works offline. Chat and Agent now produce nodes in the shared NodeStore. Legacy Search and History screens still
read Markdown and its schema. The Vault owns [translation and enrichment tooling](https://github.com/JimLundin/vault/tree/main/.vaulter/tooling/migration)
that targets the current Vaulter modules. Its source readers, extraction policy and private review
data evolve in the Vault; Vaulter modules own their current record validation and historical reads.
See [Wiki ingestion](docs/wiki-migration.md) for the boundary and current interfaces.
The design and its history: `PLAN-browser-app.md`
(written while the app still lived in the vault, as `site/`, and the repos were `my-vault` and `vault-pages`).

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run check` | the permanent note, schema and graph integrity checks over `../vault`, or `node tools/check.ts --vault <dir>`; the vault's CI uses the same check |
| `npm run dev` | the app on the vault through GitHub, as built, in any browser, but with no password: it loads right in with the secrets from `.env.local` (gitignored): `VAULT_GITHUB_TOKEN`, and optionally `VAULT_OPENAI_KEY` and `VAULT_JINA_KEY`, the names CI seals. Only dev gets them; a build has none. Its commits go to the vault's `main`, as the app's do |
| `npm run kit` | the component kit gallery and reference design |
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
| `node tools/seal-secrets.ts <out>` | seal the token and key with the password from the environment (what CI runs; see Publishing) |

Product composes node-backed Chat, independent Agent and module-owned content tools. Content
publication records immutable node history and attributed tool receipts; failed saves are recoverable
without repeating effects. The separate legacy rename-note operation stages file moves and reference
rewrites. Legacy staged edits are preserved when sending node Chat messages.
Consecutive tool calls fold into an expandable summary, with a live status showing the current action.
The app includes a manifest and icons for installing it to the Home Screen.
Questions collects retained requests for information, with search and Open, Answered, Abandoned
and All filters. The agent can ask a question about a Wiki page or section, where the same question
also appears. Answer from either view; the response and its evidence link are saved together and
remain readable after reload. The agent can consult retained questions and answers on later turns.
Settings groups Appearance, Chat instructions, Agent execution options, OpenAI models and voice,
GitHub storage, and Jina credentials. Preferences apply to new runs and are saved on this device.
Models, voice, step limits, output limits and retry counts offer dropdown choices with custom values.
Login-preloaded keys show their configured status. Replace them, restore their login values, or clear
optional keys with explicit actions; production credential overrides are encrypted on the device and
removed by sign-out. Replacing the GitHub token reconnects storage before activating it. The API
endpoints and vault repository show the installation's build configuration. Jina is retained for future
web search. Enter sends an agent
message; Shift+Enter adds a new line. Both devices use the same always-visible one-row message
field with inset microphone and Send controls. Tap the microphone to dictate into that field,
tap again to finish, then edit or submit with Send or Enter. Speech appends to any existing draft;
starting another recording appends more words. The field follows incoming words without opening
the phone keyboard. Suggested prompts live in a separate strip and open an editable draft.
Other feature pages keep a floating microphone above the icon-only phone footer.

Live transcription uses OpenAI's transcription-only WebRTC session with `gpt-live-transcribe` and
the already-unlocked OpenAI key. Partial deltas print immediately; final text replaces the partial
draft before sending. Recording does not submit a message. Audio goes to OpenAI only after starting
the microphone; it is not stored in the vault. Errors and interruptions preserve partial text for
editing. The sample preview uses a
scripted transcript and makes no microphone or model requests.

All code is TypeScript. Node 24 runs the scripts directly (type stripping), so only erasable syntax,
explicit `.ts` imports and `import type` (enforced by `tsconfig.json`).

## Project layout

For the edit loop, test the owning module, for example `npm run test:watch -- app/workflows/chat`.
For browser work, start with a spec and device:
`npm run test:ui -- tools/browser/composer.spec.ts --project=desktop`.
The [testing guide](docs/agents/testing.md) explains test placement, device tags and delivery checks.
Full suites run only in CI: test the change locally, commit and push your feature branch, then
inspect CI for that commit. Unscoped local suite commands exit with a focused-command example.
CI runs behavior, architecture, static and production checks independently alongside four browser
shards; every check must pass before production deployment.

`app/product.tsx` composes the optional workflows in `app/workflows/`. Each task owns its behavior,
views and tests. Removing a feature means deleting its folder and its wiring in Product. The
permanent `app/vault/` module owns notes, schema, graph, validation, credential encryption and checked writes.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the interfaces and dependency rules.

The app uses the component kit and reference design from branch `ui-kit`, in `app/ui/kit/`. Run
`npm run kit` to open its searchable catalogue, with live desktop and mobile examples side by side.
Every public component must have an example; CI checks coverage and app-wide kit composition.
Workflow views compose its public components; styles stay in the kit, with a scoped exception for Markdown rendering. `tools/layout.test.ts` enforces the import rules
in CI, including dynamic imports and aliases.

The vault's vocabulary remains in its own `meta/schema.yaml`. `app/vault/validation/check.ts` combines
note format and graph integrity checks; `tools/check.ts` runs them over a vault on disk. Legacy file
commits pass those rules and carry `Committed-From: vault app`. Node transactions enforce their
structural integrity and the supplying module validates its own content.

## Central node storage

The central NodeStore contract supports immutable versions, atomic transactions, grouped placement
and connection values, and identity or exact-version references. GitHub persistence writes one
transaction envelope into the private vault's `.vaulter/nodes/v1/transactions/` namespace and uses
a plaintext Dexie device cache. Node-backed Chat accepts its message
and initial Agent run together, while Agent can also execute independently of conversations. Modules
choose their tools and publication rules. Generic History reads expose records, cutoffs and differences
without running producers; Product composes Agent/Chat/content preservation for compensation. The
visible History and Search screens remain legacy file workflows. See [Agent records](docs/agent-records.md),
[Chat nodes](docs/chat-nodes.md), [consumer contracts](docs/node-consumers.md) and
[node storage](docs/node-storage.md) for target layouts, recovery, acceptance and current limits.

## Publishing

Review the branch's current Product UI in its hosted sample preview before merging.
The [preview workflow for agents](docs/agents/preview.md) covers comparisons and production promotion.
Every branch push runs the checks. Non-main branches publish their sample preview at
`/preview/<branch-name>/`, with the component gallery at `/preview/<branch-name>/kit/`.
For example, `feature/input` publishes at `/preview/feature/input/`. `main` publishes production.
`design-variants` is retained as historical design work; its remaining mobile polish and installation
support have been integrated into `structure`. The historical branch still has its older workflow
and should receive no further pushes.
The banner identifies the preview commit; `version.json` records its branch.
Use **Mobile** in the movable preview pill to review phone width from your desktop. Switch it off
to follow the window. Switching retains your current page, draft and open settings/search fields.
The pill overlays the app; drag its grip to move it, or use arrow keys and Home on the focused grip.
The app, preview and gallery share one primary microphone/Enter action according to field focus.
Both use the same Filled style as New chat and confirmation actions; an empty focused draft keeps
Enter disabled. The default preview has no active comparison or variation picker.
It uses the actual current Product views, fictional notes, an in-memory backend,
and a scripted local model. Try “vault it: leave space for a walk before work” to create, read and
update a fictional content node through the actual Agent. Reload reopens accepted Chat history without
replaying tools; Reset demo clears its tab journal. Try “ask me: Which tools should stay?” to save a
question about Garden studio, then answer it from Questions or the Wiki page.
Query scenarios `initial-save`, `lost-response`,
`outcome-save` and `terminal-save` demonstrate persistence recovery. It ships no credentials, reads
no private vault contents, and registers no service worker. Search links still expose the current
branch's missing reader routes; that remains an architecture review finding.

For local iteration, run `npm ci` then `npm run design` on the branch being reviewed. Edit the kit or
workflow views and Vite updates the browser. Use `npm run kit` separately for the kit's full gallery. The development
preview lives at `/preview/`; the built preview moves its entry to the deploy root and includes the
gallery under `kit/`.

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
`tools/publish-design.ts` refuses to publish if that exact production artifact is unavailable or if
the preview contains `secrets.json` or `sw.js`. The `github-pages` environment permits branch
deployments for these previews. Preview publishing does not merge the application branch or migrate vault data.
Main deployments publish production together with the retained branch previews.

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
| `VAULT_GITHUB_TOKEN` | secret | a fine-grained PAT for `vault` and `vaulter` only (Contents read/write, Metadata read), with an expiry; only the vault is needed by the current workflows |
| `VAULT_OPENAI_KEY` | secret | optional: the agent's key, from a project with a spend limit |
| `VAULT_JINA_KEY` | secret | optional: retained sealed field for deployments that supply it |
| `VAULT_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`); set once |
| `VAULT_OPENAI_API` | variable | optional: the agent's OpenAI-compatible endpoint (an API proxy); empty means api.openai.com |
| `VAULT_REPO` | variable | optional: the vault the app reads, `owner/name@branch`; default `JimLundin/vault@main` |

A new token or key: update the secret and run the workflow (Actions → Deploy → Run workflow);
devices stay signed in. To sign every device out, change `VAULT_SALT` (or the password) and run it.
