# Architecture

How the app is put together. It is three parts: **core**, the platform, which knows only files; **notes**,
which reads each file as a note; and the **graph**, which connects the notes. Everything else is a
feature on top. The vault's vocabulary is the vault's own data, and nothing the browser runs needs Node.

## The parts

| Part | Where | Knows | Holds |
|---|---|---|---|
| Core | `app/core/` | files (a path and its text) | the session and keys, the writer, the extension host, routes, slots, the frame (sidebar, header, the panel, the phone's bar), ⌘K and its search engine, the keys, the worker |
| Backends | `app/backends/<name>/` | where a vault lives | one way to a vault each, with its own storage on the device: GitHub (with its cache), memory (tests) |
| Notes | `app/extensions/notes/` | files | the note: a file's fields (stored as frontmatter) and body, the vocabulary (`meta/schema.yaml`), the notes' rules, rename, the note page and its rendering |
| Graph | `app/extensions/graph/` | notes | what the notes connect into: links and backlinks, relations, topics, activity; and the rule that every link and every note a field names exists |
| Features | `app/extensions/<name>/` | core, and notes or the graph where they need them | everything else: home, calendar, map, editor, agent, … |
| Tools | `tools/` | Node | CI only: the vault's check (`check.ts`), sealing the secrets (`seal-secrets.ts`) |

**Singular and adaptable.** What there is exactly one of is core's: one vault open, one writer every write
goes through, one host, one frame. What adapts is added beside it: features (a folder each), backends (one
active), slots (a feature's places for others), and the vocabulary (an edit to the vault).

**Dependencies point one way.** Core imports no feature; the only lists of them are
`app/extensions/index.ts` (the features) and `app/extensions/heavy.ts` (their slow derivations), which
`App.tsx` and the worker read. Notes knows nothing of the graph; the graph reads notes only through what
notes hands it (`links.ts`, `refs.ts`, `fields.ts`), never text or frontmatter. A feature that adds to
another's page imports that feature's slot (below), so it depends on what it adds to. A feature's own
logic lives in the feature, pure or not; `model/` holds the pure part (no DOM), which CI runs too.

## Files, the platform's only knowledge

The host gives every feature the vault's **files**, with the staged edits (`host.files`); what they mean is
each feature's: `graphOf(files)` / `useGraph()` for the graph, `useSchema()` for the vocabulary, both
computed once per files. A feature says which files it keeps (`files` below), so:

- a backend reads only kept files (`keeps`); the rest of the repo stays where it is;
- the writer refuses staging a file no feature keeps, and a commit that adds a problem to any feature's
  rules (notes': each note's format; the graph's: links and fields resolve);
- `blocked` stops every page while the files can't be read as a feature's (notes: a broken vocabulary).

`app/extensions/check.ts` runs every feature's check together: what CI runs (`tools/check.ts`, on every
push to the vault) and what the tests hold a whole vault to.

## Adding a feature: extensions

A feature is a folder in `app/extensions/` exporting an `Extension` (`app/core/extension.ts`) and one line
in `app/extensions/index.ts`. Core renders what it contributes:

| Point | What it is | Used by |
|---|---|---|
| `page(path, host)` | the page for a route, or null; asked in list order; `width` reading or wide | every feature with a page |
| `nav` | pages in the sidebar, with `when` (only if it applies), `badge`, an `icon`, go-to `keys` ("g c") and `tab` (the phone's bottom bar); searchable as pages | calendar, map, places, decisions, audit, editor |
| `commands(host)` | what Jim can do: in ⌘K, on their keys, in the shortcuts list (?) | home, notes, agent, editor |
| `panel` | the panel beside every page (docked, a sheet, or a drawer on a phone), with its button's `indicator` and "Ask …" in ⌘K | agent |
| `sidebar` | groups in the sidebar under the pages, by `order` | home (areas), notes (recent) |
| `contributes` | entries in other features' slots (below) | notes, calendar, decisions, map, similar, editor |
| `search(host)` | entries for search and link previews | notes, topics |
| `files` | the files it keeps (`keeps`, `what`) and the `problems` a change adds | notes, graph |
| `blocked(host)` | why no page can be shown now, or null | notes |
| `mdx` | components notes may use (allowed by `meta/schema.yaml`) | notes |
| `tools(ctx)` | agent tools, loaded with the agent | agent, editor (`renameNote`), audit (`audit`), code (the app's own source), web (`webSearch`, `fetchPage`) |

A feature's own derived data is computed once per graph with `perGraph` (`graph/model/graph.ts`); a slow
one is listed in `app/extensions/heavy.ts`, computed in the worker, kept per tree, and read with
`useHeavy<T>(key)`. Contribution points are added when a feature needs one, not before. Rows a list can
move through (j/k, ↑/↓) are marked `data-nav` (`app/core/keys.ts`); passing confirmations are sonner toasts.

Example, a reading list: `app/extensions/reading/index.tsx` with a `page` for `#/reading/` listing notes
tagged `reading` and `status/active` (from `useGraph()`), a `nav` entry, an entry in the notes' sections
(`noteSections.add(…)`, "On the reading list") and, if the agent should use it, a `tools` entry. Nothing
else changes.

### A feature's own places: slots

The points above are core's: the frame every page is in. A place in a feature's own page, where other
features add to it, is that feature's **slot** (`app/core/slot.ts`). The feature makes it, typed by what an
entry is, exports it, and draws its entries where they go:

| Slot | Owner | An entry is | Filled by |
|---|---|---|---|
| `noteSections` | notes (`notes/slots.tsx`) | `{ order, view }`: a section under a note's body; it renders null when it has nothing to show | notes, decisions, calendar, map, similar |
| `noteActions` | notes | `{ label, href(note), when? }`: a link in a note's footer | editor (edit, rename) |

A feature fills one by importing it and listing what it adds in `contributes`:

```tsx
// app/extensions/calendar/index.tsx
import { noteSections } from '../notes/slots.tsx';
export const calendar: Extension = { id: 'calendar', /* … */ contributes: [noteSections.add({ order: 50, view: NoteDates })] };
```

The entry is checked against the slot's type where it is written, and read back typed by its owner
(`noteSections.of(extensions)`), with the feature it came from. The owner decides the order. So removing
a feature has one outcome: what it added is gone from every page, and nothing else changes. Removing a
feature that owns a slot fails the build at every import of it. A new slot is made when a feature first
needs others to add to its page, not before.

### A feature's routes

A feature's pages are at routes it owns, in its `routes.ts`, each a typed pattern (`pattern()` in
`app/core/route.ts`): `editPage = pattern('/edit/:file/')`. The feature finds its page with it
(`editPage.match(path)` gives `{ file }`, or null), and every link to the page is made by it,
`editPage.href({ file })`, so its params are typed and encoded once. Another feature that links there
imports the route (the agent links to the editor's `historyPage`), so a route that moves moves its links,
and a feature that goes fails the build where it was linked to. Notes, topics and areas are the vault's
own hrefs (`app/extensions/notes/model/paths.ts`, `topicHref`), not a feature's.

### Commands and tools

A command (`commands`) is what Jim does from the UI: it takes no input, reads the screen it is on (the
route, the host) and acts, often by opening a page that asks for more. A tool (`tools`) is what the agent
does: its input comes from the model, so it is outside typed code, and each tool declares a Zod
`inputSchema`, which the AI SDK checks before the tool runs (the model gets the error back otherwise).
They stay separate, since most commands only move around the UI and Jim's paths have review steps the
agent's don't (the rename's preview, the commit's diff); unify them if most features come to need both
for the same thing.

What both do is one function, in the feature (or core's writer), and a command and a tool are thin over it,
next to each other when both exist. The function checks what the input means (the note exists, the path
is a vault file, the check passes), so Jim and the agent are held to the same rules; a tool's schema checks
only its shape. Rename (`notes/model/rename.ts`), staging (the writer's `stage`, which takes only kept files
and deletes only files that exist), the commit (the writer, which refuses an empty one and runs every
feature's check) and the audit (`audit/audit.ts`, over any span; `weekAudit` is the week the page and the
tool show) are such functions.

## Reaching the vault: backends

The app reaches a vault only through `VaultBackend` (`app/core/backend.ts`):

| Member | Does | GitHub | Memory |
|---|---|---|---|
| `cached()` | the head kept on this device, to open at once and offline | encrypted IndexedDB | — |
| `refresh()` | the latest head, or null if unchanged | 304 on main's ETag, then only new blobs | ✓ |
| `watch(on)` | changes made elsewhere, with the head when at hand | other tabs (BroadcastChannel) | ✓ |
| `write(changes, message, verify)` | one atomic step after `verify` (the check) | Git Data API, fast-forward only, rebuilt if main moved | ✓ |
| `history` / `patch` / `revert` | steps written from the app, and undoing one | commits with the trailer | ✓ |
| `since(day)` | what changed since a day, and a file's text then (the audit) | 2 requests + blobs on demand | ✓ |
| `keep` | the app's own small state (staged edits, worker results) | encrypted | memory |
| `clear()` | forgets what it keeps on this device (signing out) | its database | — |

A backend's storage is its own: the GitHub cache (`github/cache.ts`, its own IndexedDB database) holds file
versions by sha and the snapshot of `main`, encrypted with the cache key, and is cleared when another key
opens it. Core keeps only the keys (`unlock.ts`) and the encryption (`crypto.ts`, `idb.ts`).

The writer (`app/core/writer.ts`) stages edits for any backend and gates every write with the features'
`problems` (`verify`); staged files remember their content id, so a change made elsewhere since staging is
a conflict, not an overwrite.

## The vocabulary is the vault's

`meta/schema.yaml` holds what is particular to this vault: note types, areas (label, hub), statuses,
circles, broad topics, the owner, relation predicates, and which MDX components notes may use. Notes reads
it (`schemaFor(files)`, `useSchema()`), and the checks, the graph and every view use it at runtime; code
keeps only mechanics (frontmatter fields, filename and tag patterns, rule logic). Changing a label or adding an area is
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

The app moved here from the vault's `site/` on 2026-10-03, as a fresh first commit (the older history
holds personal content), and the repos were renamed the same day (`vault-pages` → `vaulter`, `my-vault` →
`vault`). The app is at https://jimlundin.github.io/vaulter/.

For a vault that isn't this one: area colours keyed by area order instead of
name (`app/core/base.css`), and the special cases in Home (`active`, `leisure`), the check (`person`, `moc`,
`place`, `Home`) and the folder layout (`notes/model/note.ts`) moved into `meta/schema.yaml`.

## Browser only

Nothing the browser runs uses Node; `npm run dev` serves files only, and runs the app as built (GitHub
through the encrypted cache) without the password. Node remains, outside the app, as:
- **The toolchain**: Vite, Vitest and TypeScript, in development and CI.
- **CI**: `tools/check.ts` on every push to the vault, `tools/seal-secrets.ts` when deploying.

The vault is worked only in the app: the audit, rename and Captures have no command-line form.

The app runs the same in every browser, Safari included: GitHub through IndexedDB, nothing that needs
Chromium (no directory picker).
