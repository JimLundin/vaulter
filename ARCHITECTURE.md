# Architecture

How the app is put together, and the rules that keep it adaptable: features are added without touching
the shell, the app reaches the vault only through one contract, the vault's vocabulary is the vault's own
data, and nothing the browser runs needs Node.

## Layers

| Layer | Where | May use | Holds |
|---|---|---|---|
| Vault model | `core/` | itself and pure libraries (no DOM, no Node) | parsing, the check, derivations, the vocabulary reader, formats, audit, rename |
| Shell | `app/core/` | `core/`, the DOM, Preact | routing, top bar and search, the extension host, the writer, the session, the encrypted store, the workers |
| Backends | `app/backends/<name>` | `core/`, `app/core/backend.ts` | one way to a vault each: GitHub (with the cache), a picked folder, memory (tests) |
| Features | `app/extensions/<name>/` | `core/`, `app/core/` | everything the user sees beyond the shell |
| Tools | `tools/` | Node, `core/` | thin CLIs over `core/`: the CI check, sealing, and the audit and rename for shell sessions |

Dependencies point one way: `core` knows nothing of the app, the shell nothing of git or GitHub, features
nothing of each other's internals (a few share a small view, e.g. the notes' `to()` link).

## Adding a feature: extensions

A feature is a folder in `app/extensions/` exporting an `Extension` (`app/core/extension.ts`) and one line
in `app/extensions/index.ts`. The shell renders what it contributes:

| Point | What it is | Used by |
|---|---|---|
| `page(path, host)` | the page for a route, or null; asked in list order | every feature with a page |
| `nav` | top-bar links, with `when` (only if it applies) and `badge`; searchable as pages | calendar, map, places, decisions, audit, agent, editor |
| `noteSections` | sections under a note's body, by `order` | notes, calendar, decisions, map, similar |
| `noteActions` | links in a note's footer | editor (edit, rename) |
| `homeSections` | sections of Home, by `order` | home |
| `search(v)` | entries for search and link previews | notes, topics |
| `mdx` | components notes may use (allowed by `meta/schema.yaml`) | notes |
| `tools(ctx)` | agent tools, loaded with the agent | agent, editor (`renameNote`), audit (`audit`), code (the app's own source), web (`webSearch`, `fetchPage`) |

A feature's own derived data is computed once per vault with `perVault` (`core/derive.ts`); a slow one is
registered in `core/heavy.ts`, computed in the worker, kept per tree, and read with `useHeavy(key)`.
Contribution points are added when a feature needs one, not before.

Example, a reading list: `app/extensions/reading/index.tsx` with a `page` for `#/reading/` listing notes
tagged `reading` and `status/active`, a `nav` entry, a `noteSections` entry ("On the reading list") and,
if the agent should use it, a `tools` entry. Nothing else changes.

## Reaching the vault: backends

The app reaches a vault only through `VaultBackend` (`app/core/backend.ts`):

| Member | Does | GitHub | Folder | Memory |
|---|---|---|---|---|
| `cached()` | the head kept on this device, to open at once and offline | encrypted IndexedDB | — | — |
| `refresh()` | the latest head, or null if unchanged | 304 on main's ETag, then only new blobs | re-reads changed files (mtime, size) | ✓ |
| `watch(on)` | changes made elsewhere, with the head when at hand | other tabs (BroadcastChannel) | FileSystemObserver, else polling | ✓ |
| `write(changes, message, verify)` | one atomic step after `verify` (the check) | Git Data API, fast-forward only, rebuilt if main moved | writes the files (not atomic across files) | ✓ |
| `history` / `patch` / `revert` | steps written from the app, and undoing one | commits with the trailer | — | ✓ |
| `since(day)` | what changed since a day, and a file's text then (the audit) | 2 requests + blobs on demand | — | ✓ |
| `keep` | the app's own small state (staged edits, worker results) | encrypted | localStorage | memory |

The writer (`app/core/writer.ts`) stages edits for any backend and passes the check as `verify`; staged
files remember their content id, so a change made elsewhere since staging is a conflict, not an overwrite.

## The vocabulary is the vault's

`meta/schema.yaml` holds what is particular to this vault: note types, areas (label, hub), statuses,
circles, broad topics, the owner, relation predicates, and which MDX components notes may use. The check,
the audit, the map and every view read it at runtime (`schemaOf(files)`, `useSchema()`); code keeps only
mechanics (frontmatter fields, filename and tag patterns, rule logic). Changing a label or adding an area is
an edit to the vault, not the app.

## The app changes itself

The agent can change this repo as it does the vault (`app/extensions/code/`): list, read and search the
source, stage whole files, and commit them to `main` as one commit, never by force (rebuilt on `main` when
it moved, a conflict when the same file did). There are no pull requests: `main` is the gate's input, and
`.github/workflows/deploy.yml` deploys a push only after lint, the type check and the tests pass, so a
broken change stays on `main` until a fix, never on devices. `codeStatus` reads a commit's CI runs (the
public API, no token) with the failures' annotations, and `version.json` the commit that is live. The
agent changes the app only when Jim asks or agrees (the vault's conventions, §16), and its commits carry
`Committed-From: vault app`. Jim gets a new version on the next reload.

## Two repos

`JimLundin/vaulter` (public, this repo) holds the app's source and serves it from GitHub Pages;
`JimLundin/vault` (private) holds only the vault. They meet in three places:

| Where | What |
|---|---|
| Runtime | the app reads and writes the vault through the GitHub API (`VITE_VAULT_REPO`, default `JimLundin/vault@main`), with the sealed token, a fine-grained PAT for `vault` and `vaulter` only |
| Self-change | the agent reads, changes and commits this repo (`app/extensions/code/`, `VITE_APP_REPO`, default `JimLundin/vaulter@main`); the push deploys only if lint, the type check and the tests pass |
| The vault's CI | `vault`'s check workflow checks out this repo's `main` and runs `tools/check.ts --vault .` |
| Shell sessions | this repo cloned next to the vault (`../vaulter`); the audit and set-ext run from the vault root |

The app moved here from the vault's `site/` on 2026-10-03, as a fresh first commit (the older history
holds personal content), and the repos were renamed the same day (`vault-pages` → `vaulter`, `my-vault` →
`vault`). The app is at https://jimlundin.github.io/vaulter/.

For a vault that isn't this one: area colours keyed by area order instead of
name (`app/core/base.css`), and the special cases in Home (`active`, `leisure`), the check (`person`, `moc`,
`place`, `Home`) and the folder layout (`core/vault.ts`) moved into `meta/schema.yaml`.

## Browser only

Nothing the browser runs uses Node; `npm run dev` serves files only (the folder backend reads the vault
in the browser). Node remains, outside the app, as:
- **The toolchain**: Vite, Vitest and TypeScript, in development and CI.
- **CI**: `tools/check.ts` on every push to the vault, `tools/seal-secrets.ts` when deploying.
- **Shell sessions**: `tools/audit.ts` and `tools/set-ext.ts` for Claude sessions with a shell; both are
  thin wrappers, and the app has the same as a page, a command and agent tools. They can go once the
  in-app agent replaces those sessions.

The folder backend is Chromium-only (Safari and Firefox have no directory picker), so GitHub stays the
main backend; the folder is for development and a local clone.
