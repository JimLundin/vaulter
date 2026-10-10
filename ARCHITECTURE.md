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
    nodes/                   immutable node model, acceptance, snapshots, memory adapter
    documents/               notes, schema, links, graph, capture format, search
    validation/              permanent note and graph rules
    changes/                 persisted shared staging and checked writes
    session/                 unlocking, encryption, synchronization
    storage/                 file adapters and GitHub node persistence with encrypted Dexie cache
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
  composition.ts             private-helper composition policy and building-block usage
  composition.test.ts        CI policy check and temporary source-project acceptance tests
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

Keep a workflow's configurable fields in its own settings view, exported alongside its other views.
Product passes `{ name, content }` entries to `SettingsMenu`; the kit groups each entry under that
feature's name. Removing the feature also removes that entry. Application preferences such as
Appearance are separate sections. Features without preferences need no empty settings section.

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
new line. Public `Composer` owns the form, one-row textarea, inset actions, keyboard submission and
send-icon focus presentation for both Chat and catalogue samples. Its controlled draft and action
callbacks keep conversation lifetime in the workflow. Enter and Send share the form callback;
native IME confirmation and Safari key code 229 remain editing events. Non-whitespace text, caller
permission and an idle response are required to submit. Sync status appears with the app name in
the sidebar header.

Product binds the transcription controller to the conversation's shared draft above route selection.
Each recording retains the draft it starts with and replaces only that recording's partial words
with corrected final text. Failure or interruption retains the last draft; cleared capture ignores
late events. A subsequent recording appends to manual edits. Capture never submits a turn: Send and
Enter use the same reviewed submission path for dictated and typed text. The kit's compact voice
status grows above the anchored composer; unsubmitted speech has no separate feed entry.
The shared SendButton shows the Enter arrow on field focus and becomes the sole response Stop
control. VoiceButton stays a microphone, disabled during an agent response.

`suggestions.ts` generates short prompts from a bounded set of note titles/summaries and recent
conversation text using the selected model. It has no agent tools or write capability. The controller
caches suggestions per chat, completed turn and model, cancels them when sending/starting over or
disposing, and ignores late results. A failed request leaves the composer usable. Suggestions appear
only when the draft is empty and unfocused; selecting one fills the draft rather than sending it.
Preview supplies a scripted suggestion adapter alongside its scripted conversation model.

## UI kit

`app/ui/kit/` comes from branch `ui-kit` at `2c30183`. Its design references, Geist / Geist Mono /
Newsreader fonts, zinc colors, desktop sidebar, mobile controls and overlays are used by the app.
`npm run kit` opens a searchable catalogue: every public component has a live desktop and mobile
example side by side, using the same sample implementation. `tools/catalogue.test.ts` checks public
export coverage and actual rendered JSX. The private presentation scope bounds responsive CSS,
React size classes and portals to each example without an iframe. The exported design screens remain
reference artifacts; they do not install workflows or restore previously deleted features.

Owned shadcn controls use Base UI as their interaction library. Dialog, Drawer, Menu and Tooltip
share its layering, focus and gesture mechanics. Search uses inline Base UI Autocomplete behind
the existing Command interface; [the decision](docs/adr/0001-base-ui-search.md) records the removal
of cmdk and its transitive Radix dependency. The private `presentation-policy.tsx` owns browser
and bounded-preview choices for portals, bounds, modal behavior, dismissal and focus restoration.
Adapters consume those choices while retaining library mechanics. AdaptivePanel keeps the same
mounted drawer content as it becomes a compact drawer, expanded dialog or wide nonmodal panel.

Screens compose `ui/kit/index.ts`. Public components take no `className` or `style`; Tailwind scans only
the kit. CI rejects custom HTML, styling props, intrinsic element factories and direct presentation
library imports throughout Product, shared UI and workflows. Semantic forms use the kit's `Form`.
Add missing generic presentation and its paired example to the kit; keep task logic in its workflow.
`tools/composition.ts` checks the configured kit composition sources and their reachable private
presentation helpers and state-only React context providers. Compiler resolution follows imports,
aliases and re-exports without requiring new public exports or catalogue entries. Approved public
building blocks, including wrapped `unstyled()` parts, stop traversal and retain ownership of DOM,
styles and library mechanics. Private helpers obey the composition's existing presentation rules;
diagnostics identify their offending source and location. The policy reports each root's actual
building-block usage and checks `composition.ts` metadata, keeping the gallery's **Built from** links
accurate through private extraction. CI and temporary TypeScript project tests call the same Node-only
policy interface; product callers gain no runtime dependency.

`surfaces.tsx` supplies conversation, tool-result and unified-diff presentation. Content renderers
keep their scoped Markdown styling and safety tests; that is an explicit policy exception.
Conversation containers have separate mobile and desktop compositions. Mobile uses the available
viewport with tighter padding, smaller heading/feed spacing and a compact composer; desktop keeps
a reading-width column. `MobileActionButton` has an accessible label but no visible text; only its
primary AI variant is circular. The bottom bar retains 44px touch targets and device safe-area padding.
Menu, Search and Settings are the fixed phone controls. Settings opens over the current feature,
preserving its route and draft: a centered dialog on desktop, the same bottom drawer as Menu on a
phone. Open settings fields keep their DOM and focus through resizing. `/settings/` remains a direct
entry to that menu over Agent. `SettingField` declares the visible label and description once;
private association state connects supported text controls and radio groups through nested layouts.
Native text labels target each control's effective identifier; choice fields name and describe the
group. Explicit identifiers and additional descriptions are retained, and repeated fields remain
independent. Model and Appearance values and persistence stay with their existing adapters.
Feature screens use the kit's centered `FeaturePage` reading column;
Agent shares its width token. The composer is a fixed single row with trailing controls; on mobile
its always-visible field contains the same inset microphone and Send controls as desktop. Focusing opens the
normal device keyboard without revealing another form. Shift+Enter can still insert newlines, which
scroll inside the field. Other features retain the floating voice action above their footer.

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
GitHub Pages job runs on `structure` and `design-variants`, refreshing the shared `/preview/structure/`
and kit gallery links alongside the exact deployed production artifact. The preview version records
the publishing branch and commit. Design iteration precedes merging the application and migrating
private vault content.

## Node storage alongside file workflows

`NodeStore` is the central storage interface for all application data. Features produce node records
and represent stored data through this contract. Node versions group
an exact key, optional placement, optional source/target connection, and JSON content. Each domain
transaction appends complete versions atomically with required authorship. Identity addresses
resolve within the viewing snapshot; transaction-qualified addresses select exact immutable rows.
`useVaultSession()` exposes `nodes` and independent `nodeStatus`. Bootstrap selects `OpenNodes`
with the unlocked key and GitHub credentials; the design preview uses memory. Adapter lifecycle,
remote acceptance, and cache clearing stay in the session, outside workflows.

GitHub node persistence writes a versioned transaction namespace alongside existing repository
files. A non-forced ref update is definitive acceptance; stale expectations reject or unrelated
remote races retry. Dexie is an encrypted rebuildable cache, not a separate source of authority.
The [storage guide](docs/node-storage.md) and [persistence decision](docs/adr/0003-github-node-persistence.md)
describe retry, ordering, offline, encryption, and history-size semantics. The existing chat/tools
and History still use files during the transition. [Consumer contracts](docs/node-consumers.md)
live with their owning workflows: `workflows/chat/records/` holds Chat payloads, lossless schemas,
acceptance requests, saved-message projections and its transcript-preservation policy;
`workflows/history/nodes.ts` holds attributed History differences and compensation. Product supplies
feature-owned undo policies to History, so workflows never import one another. Storage exposes only
generic node/transaction reads and atomic append writes; it knows no feature payloads or undo policy.
An update appends a new version of the same node identity. Agent execution, collection and
Product/History wiring follow in the agent PR above this layer.
