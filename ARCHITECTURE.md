# Architecture

Features are user workflows, composed directly in `app/product.tsx`. Each workflow exports the named
functions and views it needs. There is no extension descriptor, host, slot registration, or runtime
feature toggle.

```text
app/
  main.tsx                   bootstrap, fonts, theme, GitHub adapter
  product.tsx                optional workflow imports and all product wiring
  workflows/
    chat/                    conversation lifetime, streaming, capture orchestration, views, tests
    rename-note/             rename operation, reference rewrites, model adapter, tests
    history/                 history and revert presentation
  vault/
    index.ts                 live vault interface and session
    documents/               notes, schema, links, graph, capture format, search
    validation/              permanent note and graph rules
    changes/                 persisted shared staging and checked writes
    session/                 unlocking, encryption, synchronization
    storage/                 GitHub and memory adapters
  ui/
    kit/                     component kit and reference design from ui-kit
    Frame.tsx                direct desktop/mobile layout composition
    Search.tsx                search and already bound commands
    routing.ts               generic hash-route mechanics
    keys.ts                  shortcuts and list navigation
    Unlock.tsx               password form
    Previews.tsx             delegated hover previews
    recent.ts                local navigation history
    sw.ts                    offline application cache
 tools/
  check.ts                   the same vault integrity checks over files on disk
  layout.ts                  resolved dependency and kit-use policy
  layout.test.ts             enforces the policy in CI
  seal-secrets.ts            deployment secret sealing
```

## Adding or removing a workflow

Create a folder under `app/workflows/` for the task, including its views, operations, state, adapters,
and tests. Small tasks need only a few files. Give callers ordinary named exports: for example,
`renameNote(vault, { from, to })`. Model adapters validate external inputs with Zod and call the same
operation. No common workflow manifest is required.

Wire the task in `product.tsx`: imports, routes, navigation, commands, callbacks, and model tools as
needed. Product passes dependencies and optional links explicitly. A workflow never imports another
workflow, including in tests. For example, chat receives an optional history URL; it does not know
where History lives. Product also supplies rename's tool factory to chat.

To remove History, delete `workflows/history/` and remove its import, route, navigation, command,
page branch and optional history URLs from `product.tsx`. To remove rename, delete
`workflows/rename-note/` and remove the lazy tool binding from Product. Run typecheck, tests and build.
No vault, kit, or other workflow edit is required. Old routes show “Not found”. Persisted data remains
readable and checked. These two removals have been verified in disposable copies.

`tools/layout.test.ts` inspects the TypeScript AST and compiler-resolved targets, including aliased
imports, dynamic imports and re-exports. Only Product may compose different workflows. Literal module
paths make this check complete for source imports. The checker also prevents vault from importing UI
and keeps callers on the kit's public exports. Cross-workflow integration tests should be kept with
Product and removed with the corresponding wiring.

## Vault owns data integrity

The vault is mandatory infrastructure. It owns note parsing, `meta/schema.yaml`, link and reference
validation, graph derivation, encryption, synchronization, and the shared staged preview. File
selection and write checks no longer depend on which workflows are installed.

`Vault` exposes current files, staged paths, staging, checked commit/revert, history and patch queries.
`liveVault()` binds once and reads the latest writer for each call; asynchronous tools do not depend on
another view rendering. Workflows receive no backend handle or raw secrets. Bootstrap selects a
storage adapter; Product supplies only the model dependency to chat.

Use `vault.update(files => changes)` for a change calculated from vault contents. The vault acquires
exclusive ownership, reloads the cached head and persisted overlay, calculates against that preview,
then persists and publishes the complete change set. Rename uses this operation; it cannot calculate
from files that an earlier queued edit is about to replace. `stage()` and `stageMany()` remain useful
for prepared text; they do not make an earlier, separate read atomic.

Use `vault.write(async owned => ..., { staged, signal })` for a sequence that reads and writes across
multiple steps. Use the supplied `OwnedVault` throughout, including optional tool factories. It has
the same operations without `write()`, so nested operations reuse ownership. Reads stay on the
sequence's head and staged preview. Another writer waits until the callback completes or fails.
Choose `staged: 'reject'`, explicitly include all existing staging, or supply the exact reviewed
`Change[]`. A reviewed set must still match persisted staging after ownership is acquired. Chat shows
the diffs and requires “Include changes and send” before including existing edits. Revert refuses
to run with pending staging.

Ownership belongs to the backend's persisted state, shared across writer instances. Memory uses one
queue; GitHub uses the origin's Web Locks. Cache replacement by sync and commit has its own Web Lock,
and adopts the latest cached snapshot before proceeding. BroadcastChannel tells other tabs to reload
staging; notifications are hints, and every mutation reloads under ownership. GitHub refuses writes
when Web Locks are unavailable. These locks cover one browser origin; remote writers still rely on
source identity checks and GitHub's fast-forward requirement.

Cancellation expires the owned handle, rejects queued tools and drops late calculations. Ownership
waits for any persistence or remote write already in progress to settle before admitting another
writer. A completed remote write cannot be undone by cancellation. Failed and stopped sequences keep
their staged edits for review. A failed staging validation or persistence operation publishes none of
a partial rename. Commits check source identities against the backend's actual write base, including
when sync advances during a sequence, and reject newly introduced integrity problems. Full-vault CI
retains its existing check semantics.

## Conversation lifetime

Product creates one conversation above route selection. Closing its panel or moving to History does
not cancel a turn. Each controller owns its turns, draft, model history, subscriptions and capture
position. Opening a view clears its unread state. Sign-out and unmount dispose it, aborting work and
suppressing later UI notifications. Separate controllers never share a global current host.
Each turn acquires vault ownership before constructing tools and holds it through streaming and
capture. Stopping or disposing a turn expires the vault supplied to its tools, even if a tool factory
ignores cancellation. Capture appends through `update()` so overlapping tools calculate in order.
Product assembles the Settings route from the kit's theme control and chat's `ChatSettings` view.
Chat owns its model preference; the controller reads it at the start of each new turn. The composer
contains only message entry and dictation/send controls, with Enter to send and Shift+Enter for a
new line. The kit owns their placement and keeps text clear of the controls. Sync status appears
with the app name in the sidebar header.

## UI kit

`app/ui/kit/` comes from branch `ui-kit` at `2c30183`. Its design references, Geist / Geist Mono /
Newsreader fonts, zinc colors, desktop sidebar, mobile controls and overlays are used by the app.
`npm run kit` opens the standalone gallery. The exported design screens remain reference artifacts;
they do not install workflows or restore previously deleted features.

Screens compose `ui/kit/index.ts`. Public components take no `className` or `style`; Tailwind scans only
the kit. Add missing generic presentation to the kit, and keep task logic in its workflow.
`surfaces.tsx` supplies conversation, tool-result and unified-diff presentation. Content renderers
keep their scoped Markdown styling and safety tests; that is an explicit policy exception.

## Browser and deployment

The browser uses GitHub through an encrypted IndexedDB cache, including offline snapshots and staged
edits. Memory is the test adapter. No browser source depends on Node. The toolchain and `tools/` use
Node 24. Deployment seals `dist/secrets.json`, which the app loads relative to its published root.
Notes remain in the private vault; this repository ships application code only.

`app/preview/` is an alternate bootstrap for design review. It supplies a memory backend and scripted
model to the same Product views, with sample Markdown and an initial sample history entry. Product
receives the model and preview label explicitly; workflows do not import the preview. Conversation
metadata collection is supplied as an adapter, so preview sends do not request location or weather.
The preview builds separately, contains no sealed secrets and registers no service worker. Its
GitHub Pages job adds `/preview/structure/` and the kit gallery to the exact deployed production
artifact. Design iteration precedes merging the application and migrating private vault content.
