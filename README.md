# The app

The browser app Jim reads the vault in, at **https://jimlundin.github.io/vaulter/**. It holds no notes:
behind a password it reads them at runtime from the vault, the private repo `JimLundin/vault`, keeps
them encrypted on the device, and works offline. The current branch reads Markdown and the vault's
schema; remaining legacy MDX content will be migrated after design review and merge. The design and its history: `PLAN-browser-app.md`
(written while the app still lived in the vault, as `site/`, and the repos were `my-vault` and `vault-pages`).

## Commands

| Command | Does |
|---|---|
| `npm ci` | install |
| `npm run check` | the permanent note, schema and graph integrity checks over `../vault`, or `node tools/check.ts --vault <dir>`; the vault's CI uses the same check |
| `npm run dev` | the app on the vault through GitHub, as built, in any browser, but with no password: it loads right in with the secrets from `.env.local` (gitignored): `VAULT_GITHUB_TOKEN`, and optionally `VAULT_OPENAI_KEY` and `VAULT_JINA_KEY`, the names CI seals. Only dev gets them; a build has none. Its commits go to the vault's `main`, as the app's do |
| `npm run kit` | the component kit gallery and reference design |
| `npm run design` | the current branch UI at `http://localhost:5173/preview/`, with fictional notes and scripted chat; no password, keys or vault connection |
| `npm run build:design` | the sample preview and component gallery into `dist-preview/` |
| `npm run build` | the app into `dist/` |
| `npm run lint` / `npm run format` | Biome: lint and format check (CI), or fix both in place. Style: 2 spaces, single quotes, semicolons, trailing commas, 100 columns (`biome.json`) |
| `npm test` / `npm run typecheck` | the tests (Vitest: `app/`) and TypeScript over `app/` and `tools/` |
| `node tools/seal-secrets.ts <out>` | seal the token and key with the password from the environment (what CI runs; see Publishing) |

The app currently contains chat, rename-note, and history workflows. The agent reads and writes the
vault through its permanent checks; rename stages the complete move and reference rewrites.
Settings holds the theme and agent model preferences, saved on this device. Enter sends an agent
message; Shift+Enter adds a new line. Send controls sit inside the optional message box.
On phones, the agent starts with voice: tap the circular microphone floating above the icon-only
footer, watch the transcript appear as you speak, tap to finish, then send or edit it. “Type a
message” opens the optional keyboard composer. Suggested prompts live in a separate strip and open
an editable draft. Desktop keeps its visible composer and microphone control.

Live transcription uses OpenAI's transcription-only WebRTC session with `gpt-live-transcribe` and
the already-unlocked OpenAI key. Partial deltas print immediately; final text replaces the partial
transcript before sending. Audio goes to OpenAI only after starting the microphone; it is not stored
in the vault. Errors and interruptions preserve partial text for editing. The sample preview uses a
scripted transcript and makes no microphone or model requests.

All code is TypeScript. Node 24 runs the scripts directly (type stripping), so only erasable syntax,
explicit `.ts` imports and `import type` (enforced by `tsconfig.json`).

## Project layout

`app/product.tsx` composes the optional workflows in `app/workflows/`. Each task owns its behavior,
views and tests. Removing a feature means deleting its folder and its wiring in Product. The
permanent `app/vault/` module owns notes, schema, graph, validation, encryption and checked writes.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the interfaces and dependency rules.

The app uses the component kit and reference design from branch `ui-kit`, in `app/ui/kit/`. Run
`npm run kit` to open its searchable catalogue, with live desktop and mobile examples side by side.
Every public component must have an example; CI checks coverage and app-wide kit composition.
Workflow views compose its public components; styles stay in the kit, with a scoped exception for Markdown rendering. `tools/layout.test.ts` enforces the import rules
in CI, including dynamic imports and aliases.

The vault's vocabulary remains in its own `meta/schema.yaml`. `app/vault/validation/check.ts` combines
note format and graph integrity checks; `tools/check.ts` runs them over a vault on disk. Every app
commit passes the same rules and carries `Committed-From: vault app`.

## Publishing

Review the latest design before merging at **https://jimlundin.github.io/vaulter/preview/structure/**.
The component gallery is at **https://jimlundin.github.io/vaulter/preview/structure/kit/**.
Every push to `structure` or `design-variants` runs the checks and refreshes these shared links with
that branch's design. The banner identifies the preview commit; `version.json` records its branch.
Use **Mobile** in the top banner to review the phone layout from your desktop. **Desktop** returns
to the wide layout; **Window** follows your browser size. Switching retains your current page,
draft and open settings/search fields. The banner stays above the whole app, including the sidebar.
This preview uses the actual Product views, fictional notes, an in-memory backend,
and a scripted local model. Try “vault it: leave space for a walk before work” to exercise staging,
checking, committing and History. Reload or Reset demo starts over. It ships no credentials, reads
no private vault contents, and registers no service worker. Search links still expose the current
branch's missing reader routes; that remains an architecture review finding.

For local iteration, run `npm ci` then `npm run design` on the branch being reviewed. Edit the kit or
workflow views and Vite updates the browser. Use `npm run kit` separately for the kit's full gallery. The development
preview lives at `/preview/`; the built preview moves its entry to the deploy root and includes the
gallery under `kit/`.

GitHub Pages accepts one site artifact. The preview job downloads the successful artifact for the
currently deployed production commit, preserves its root files, and adds `preview/structure/`.
`tools/publish-design.ts` refuses to publish if that exact production artifact is unavailable or if
the preview contains `secrets.json` or `sw.js`. The `github-pages` environment allows both design
branches for this preview. Preview publishing does not merge the application branch or migrate vault data.
An ordinary main deployment replaces the whole site, so it removes the preview until the next
design preview publish.

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
