# Pip — Extension Architecture

Oct 4, 2026 · @Jim · Pip is the project; the app is still Vaulter. A full rebuild of the previous app, on the `pip` branch.

Pip is a voice-first personal knowledge wiki built as a small kernel plus extensions, where every feature, including the ones Pip writes itself, is an extension.

## Goal and principles

You speak notes throughout the day. Pip transcribes them, asks when something is unclear or contradicts what you said before, and turns the disjointed notes into curated wiki pages about people, places and events. Over time it grows into a personal assistant: a timeline of your day, a map, a calendar, and features nobody has planned yet.

Principles:

- **The kernel only connects extensions.** It stores no notes, runs no agent and draws no screens.
- **Everything else is an extension**, including voice capture, the wiki, questions and search.
- **The delete test.** If the app still runs with a feature removed, that feature is an extension. Only what fails the test belongs in the kernel.
- **One API for people and Pip.** Anything a person can do through an extension, Pip can do through the same calls.
- **Nothing you said is ever lost.** The notes extension keeps raw notes append-only; every page and record built from them can be rebuilt.
- **Pip proposes, you approve.** Changes Pip is unsure of, and every new or changed extension, come to you as a question.

## The kernel

The kernel only connects extensions. Checked against the delete test, none of the four parts first drafted as core needs to live in it.

| First drafted as core | Becomes | Provides |
| --- | --- | --- |
| Note log | `notes` extension | `notes@1` |
| Record store | `records` contract, implemented by a storage extension such as `store-local` | `records@1` |
| Agent loop | `agent` extension | `agent@1`, `agent.tools@1` |
| Shell | `shell-mobile` and `shell-desktop` extensions | `ui.shell@1` |
| AI provider (new) | `openai` extension | `ai.chat@1`, `ai.realtime@1` (and `ai.transcribe@1`, `ai.embed@1` once something needs them) |

What remains are the jobs an extension can't do for itself:

| Kernel job | Why it can't be an extension |
| --- | --- |
| Fetch extension source from a source provider, compile it in the browser and cache the output per commit | Every extension, built-in or Pip's, has to arrive the same way |
| Validate each extension's definition and resolve contracts: match each `requires` to a `provides`, check versions | Extensions can't wire themselves without a referee |
| Route every call between extensions and check it: that the caller requires the contract, that a callback was handed to it, Pip's read, write and ask, and that a person's own actions come from a person | An extension can't police its own access; Pip's read, write and ask settings are enforced here |
| Hold secrets (and open the page's sealed ones) and attach them to requests for declared hosts only | One place that knows them, so no extension has to |
| Load each extension into the page, and give it a `fetch` that attaches secrets | Every extension, built-in or Pip's, gets the same services the same way |
| Choose which branch or commit to load, and roll back | Needed before any extension has loaded |
| Safe mode: a bare screen to switch branch, roll back or disable extensions | Recovery when a broken shell hides the app |
| Provide the `kernel` contract: the extensions, their access, approvals, drafts and review | Only the kernel knows what it loaded and why; the screens for it are extensions |

**The bootstrap set.** Before the kernel can load anything, it needs a source provider: an ordinary extension providing `extensions.source@1`, which reads extension source from the repo. Its source ships inside the kernel bundle, together with safe mode, and it is the only extension that does; it is compiled and loaded like any other. Under `npm run dev` the kernel itself provides the contract over the working tree. Moving to another git host means swapping this one provider. With nothing but the bootstrap set, the app boots into safe mode, asks for a repo and a token, and loads everything else from there.

**Contracts are the central idea.** Extensions never depend on each other by name. They require a contract, such as `records@1`, and any installed extension that provides it satisfies them. Moving storage from IndexedDB to an embedded database, or the AI from OpenAI to another provider, means installing a different provider. A Git backup extension simply requires `notes@1` and `records@1`.

**Contribution points are contracts too.** The kernel has no idea what a view, a tool or a record type is. The shell provides `ui.shell@1` with its slots, the agent provides `agent.tools@1`, and the records contract handles type registration. The kernel knows only two generic things about what crosses it: a function a contract guards with an access level (a tool's `run`), and a contract method marked personal. An extension adds a tool by contributing to `agent.tools@1`, exactly as it would to any other contract.

```
 ┌──────────── extensions, in the kernel's page ────────────┐
 │ shell-*   voice   wiki   agent   openai   …              │   each provides and requires contracts
 └───────┬──────────────────────────────────────────┬───────┘
         │ calls through kernel handles: checked,   │
         │ guarded, a fetch per extension           │
 ┌───────▼──────────────────────────────────────────▼───────┐
 │ kernel: loader · resolver · handles · policy · secrets · │   source-github's source and safe
 │         sealed secrets · its own state · safe mode       │   mode ship inside it
 └──────────────────────────────────────────────────────────┘
```

Extensions provide and require contracts, and every call between them passes through the kernel's router. Pip's agent is one extension among them, so the extensions it writes are installed through the same kernel as any other.

## Running in the page

Every extension runs in the kernel's own page: the kernel links its compiled modules into `blob:` modules (`src/kernel/link.ts`) and evaluates them here, with one copy of each shared module (the kernel API, Zod, React) for everyone. There is no sandbox. An earlier version gave every extension its own opaque-origin iframe; it was dropped (2026-10-04) because one frame per extension would have made the UI a set of separately positioned documents, multiplied memory per extension, and copied every value between them, for an isolation this app doesn't need. If isolating untrusted code ever becomes a priority, the way is WebAssembly modules, not frames.

So the kernel's checks keep well-behaved code, and Pip's model, in line; they don't contain hostile code. An extension, a draft Pip wrote included, can reach anything in the page, the secrets with it. What protects the app from bad code is the review of a draft before it reaches `main`, and safe mode to turn anything off.

**Calls go through handles.** A requirer's `ctx` holds a handle per contract, not the provider's object. Every call through a handle:

- refuses if the provider (or the caller) isn't running, or the method is a contract's personal one and no person just acted in the caller's screen;
- guards the function the provider's copy of the contract names (`guards`: a tool's `run`, with its label and level read from the tool), and checks the arguments against Zod `inputs` if the contract gives any;
- passes functions as they are, except the guarded one the contract names: that one goes through Pip's access policy on every call, as the holder calling its owner, and carries the level the policy applies now (`run.level`).

Because the guard comes from the provider's copy of the contract, a requirer can't leave it off: a draft with its own copy of a contract still hands over a guarded `run`.

Values otherwise pass as they are, not copied: a React component, a Zod schema or a `Blob` crosses like anything else. Contract methods are still async, and still take plain values where they can, so a provider may be anywhere: in this page today, behind a network or in a WebAssembly module later.

**A contract is one interface.** The provider implements it and a requirer calls it; there is no adapter between them. The records provider is given each type's Zod at registration, so it names the type in its caller's namespace and checks every value itself. `agent.tools` hands the agent each tool as it was added, its Zod input included, which the agent turns into JSON Schema for the model and checks the model's arguments against.

**Personal methods.** A contract can mark methods only a person may call: answering a question, approving, changing access, accepting a draft, unlocking the sealed secrets. An extension wraps the event handlers of its own screen with `kernel.asPerson`; a person's tap or key there (a trusted event) lets that extension, and only it, make one personal call within a few seconds, while the browser still counts the gesture as recent (`src/kernel/presence.ts`). A second call needs a second tap. Pip's own extensions never pass: the one providing `agent@1`, and any extension whose author is Pip, are refused a personal call even right after a tap, so Pip can't approve its own proposals.

**What every extension gets from the kernel** (the second argument to `setup`): `fetch`, https only, to its declared hosts, with a secret attached by the kernel when asked for (the host list is a declaration the review screen shows, not a wall: code in the page can call the browser's `fetch` too, and the page's Content-Security-Policy is what limits where anything goes); `hasSecret`; and `asPerson`, for the handlers of its own screen. No storage: an extension keeps its data through `records@1`, whose provider owns where it goes (store-local: its own IndexedDB database; a git-backed one later). The kernel keeps only its own state (settings, secrets, trees, compiled output, its logs) in a database of its own, `pip-kernel`, because it needs it before any extension loads and safe mode needs it when none works.

**Starting again is the page's job.** Nothing stops one extension at a time. Turning an extension on or off, removing one, or trying a draft saves the change and starts the app again: a page reload, which with the compile cache takes about a second and leaves nothing of the old run behind. A tab that hands Vaulter over makes every handle refuse, then reloads.

**Errors.** What is thrown through a handle (in a call, a guarded callback, a setup), and what nothing caught, is kept under the extension whose code threw it: every compiled module carries a source URL, `pip:///<commit>/extensions/<id>/<file>`, and the kernel knows each module's own URL too, so the stack says whose code it was. The last twenty per extension are kept and survive a reload, for safe mode (`kernel.extensions()`, `kernel.errors(id)`).

**One tab at a time.** Two tabs would run two kernels over the same IndexedDB, each deaf to the other's changes. The kernel holds a Web Lock while it runs; another tab shows a bare screen until the person moves Vaulter there, when the first tab makes every handle refuse, lets go and reloads into the same bare screen (`src/kernel/single-tab.ts`).

**The kernel API is versioned.** `KERNEL_API` (`src/kernel/version.ts`) is the version of what extensions are given; an extension states in its static fields the version it was written against (`kernel: '1.1.0'`, default `1.0.0`), and loads only on a kernel with the same major and at least that minor. That matters because the kernel a device runs comes from the deployed page (or the service worker's cache) while extensions come from the repo at a commit: an extension that needs a newer kernel is refused with that reason rather than failing at runtime.

## The extension format

Every extension is TypeScript source in the repo, exporting one `defineExtension({...})`. There is no second format: an extension Pip writes is the same kind of folder, on a branch.

```
src/kernel/              kernel and safe mode (the only built bundle)
tools/                   CI only: sealing the secrets into the built page
contracts/
  records/               interface, conformance suite
  agent.tools/
  kernel/                the kernel's own contract
extensions/
  source-github/         bootstrap: its source ships inside the kernel bundle
  store-local/
  wiki/
    index.ts             export default defineExtension({...})
    revise.ts
    views/Page.tsx
    wiki.test.ts
```

An extension imports the kernel as `@pip/kernel`, a contract as `@contracts/<name>`, its own files relatively, and the shared `zod`, `react`, `react/jsx-runtime` and `react-dom/client`. Nothing else resolves, so an extension can't reach into another's folder.

The definition has two parts:

| Part | Holds | Read by |
| --- | --- | --- |
| Static fields: `id`, `version`, `kernel`, `requires`, `optional`, `provides`, `permissions`, `secrets`, `agentGuide` | Plain values | The kernel before any code runs, and the review screen |
| `setup(ctx)` | Code that registers types, tools, views and handlers through the contracts it requires | Runs once the kernel has accepted the static part |

`ctx` contains typed handles only for the contracts listed in `requires`, and for those in `optional` that something provides (undefined otherwise). An optional contract keeps the delete test: the wiki gives Pip tools when an agent is installed, asks questions when there is somewhere to ask, revises pages when there is a model, and works by hand without any of them. Calling anything else fails to compile, and the kernel refuses it at runtime as well. The kernel reads the static fields by evaluating the module before `setup` runs; an extension's id must be its folder's name, and a contract's key is derived from its name and version.

**A contract is a TypeScript package** in `contracts/`: its interface, and a conformance test suite for providers. The interface is the whole definition: a misspelled slot, a missing method or a wrong argument is a type error in your editor and in CI, on both sides, so the kernel doesn't check arguments again. Zod is for what doesn't come from typed code: a tool's input (what Pip's model sends, and the JSON Schema it reads), a record type's fields (what is stored), a model's structured answer. There is no hand-written JSON and no string mini-language anywhere.

**Checks happen at three points.**

- TypeScript, in the editor and in CI on every push.
- Zod, when the kernel loads an extension's static fields, and wherever data comes from outside typed code: tool inputs, record fields, a model's answers. A contract may give Zod `inputs` for a method like that; none does today.
- Conformance suites (`contracts/<name>/conformance.ts`), which CI runs on every push, draft branches included, against every extension in the repo that provides the contract, through real kernel handles (`contracts/conformance.test.ts`). The kernel doesn't run them when it starts; a device won't try a draft whose CI checks failed.

**Separation.** Each extension's data lives with the records provider, in the extension's own namespace, and it is meant to reach others only through the contracts it requires, so removing it removes its records (the provider's `forget`) and nothing else. This is the design every extension follows, not a wall: see "Running in the page".

## How Pip uses extensions

Pip gains every extension's abilities automatically, because an extension's tools are written once and used by both the UI and Pip.

From each extension Pip gets:

- **Its data**, through the records@1 contract, which covers every type the extension registers.
- **Its tools**, with typed inputs and a permission each.
- **Its views**, which Pip can open or embed in an answer. "Where was I on Tuesday?" can return the Map view filtered to Tuesday.
- **Its agent guide**, telling Pip when the extension is the right one to use.

**Permissions per tool.**

| Permission | Pip's behaviour | Typical use |
| --- | --- | --- |
| `read` | Uses it freely | Queries, search, look-ups |
| `write` | Uses it, logs it, offers undo | Adding a fact with a clear source |
| `ask` | Proposes the change; you approve | Merging people, changing dates, anything uncertain |

You can tighten or loosen any tool in that extension's settings. The kernel enforces these on every call: a tool's `run` reaches the agent guarded as the `agent.tools` contract says, so each call Pip makes to it is routed through the kernel's policy (`src/kernel/policy.ts`), which logs `write` calls and holds `ask` calls until you approve them through the `kernel` contract. The agent tells the model each tool's level as the policy applies it now, your setting included. Neither an extension nor the agent extension itself can go around them.

**Only load what is relevant.** Pip always sees a one-line summary of each installed extension. It loads an extension's full tools and guide only when the task needs it, so twenty extensions don't crowd every request. Recording a note about a café pulls in Map; asking about next week pulls in Calendar.

## Extension lifecycle

The repo is where every extension lives, and every extension goes through the same loader. A Pip-written extension isn't a different kind of thing, just one that hasn't reached `main` yet.

| Stage | Source is on | Runs on | Moves on when |
| --- | --- | --- | --- |
| Draft | A branch, such as `draft/workouts`, written by Pip | Devices where you've chosen to try that branch, once CI's checks haven't failed | Pip has a working version and CI's checks pass: types, tests and every conformance suite |
| Trial | The same branch, with more commits as Pip iterates | The same devices | You approve it on the review screen |
| Accept | Merged into `main`, or a pull request if you want a second look | — | The merge lands |
| Live | `main` | Every device, on its next start | — |

The code, compiler, loader and contracts are the same at every stage; only the branch changes. Because drafts live in git, they survive a cleared browser cache and appear on your other devices.

- **Writing a draft** goes through `extensions.source@1`: one commit on a `draft/*` branch, only under `extensions/` and `contracts/`, never forced. The kernel is never written this way. Merging is personal, so only accepting a draft (a person, through the `kernel` contract) reaches `main`.
- **Trying a draft** is per device (`kernel.tryDraft`, or safe mode): the device loads `main` with each tried draft's changed folders on top (`src/kernel/drafts.ts`).
- **Reviewing a draft** compares the two trees and each changed extension's static fields, read by loading it, and lists in plain words what it newly asks for: a host, a device, a secret, or a powerful contract such as `kernel@1` or `extensions.source@1`. CI's checks on the draft's head come with it.
- **Rollback** is reverting the merge, or pinning the app to an earlier commit from safe mode.
- **Boot** (`src/kernel/boot.ts`) goes from a device and a source to a running kernel, or to safe mode with the reason: the tree at the branch or the pinned commit (offline, the last one this device loaded), the tried drafts on top, every extension planned and started, the `kernel` contract provided. The device is a browser (`start.ts` adds only the one-tab lock, the window's error listeners and the screens); tests boot the same way on a test device. Boot compiles each file once and caches the output by blob sha, so a new commit recompiles only what changed. If that gets slow, CI can publish compiled output beside the source.
- **Offline,** the service worker serves the kernel, and the last tree and compiled output are in the kernel's own database, so the app opens without reaching GitHub.
- **Pip gets no special access.** Its extension's permissions and secrets are part of what you review, and raising them later takes a new draft.

## Secrets

Secrets are held by the kernel, never by an extension's own code. An extension declares which secrets it needs and the hosts each one is for; it asks `kernel.fetch(url, { secret: 'key' })`, and the kernel attaches the value only to requests for those hosts. Code in the page could reach the store directly (there is no sandbox), so this keeps well-behaved extensions from handling secrets at all, rather than walling them off.

**On a device**, secrets are kept in the kernel's own IndexedDB database (`pip-kernel`), each under `secret:<extension>/<name>`, encrypted with AES-GCM under a per-device key that can't be exported. They never sync between devices.

**Sealed in the page.** So that a device needs no typing, CI seals every secret into `dist/secrets.json` (`tools/seal-secrets.ts`): one file encrypted with a key derived from a password (PBKDF2, 600,000 rounds; AES-GCM), public like the rest of the page. On a device's first start the kernel asks for the password once, on a bare screen of its own (`src/kernel/unlock-screen.ts`), and moves the secrets into the device's store. It keeps the derived key, so a later deploy sealed with the same salt is taken without asking. A settings screen can do the same through the kernel contract's personal `unlock`; it never sees a secret.

| In this repo's settings | Kind | What |
| --- | --- | --- |
| `PIP_PASSWORD` | secret | The password: 16 characters at least, long and random is best, since the sealed file is public |
| `PIP_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`), set once: devices then take each new deploy without the password |
| `PIP_SECRET__<EXTENSION>__<NAME>` | secret | One per secret: `PIP_SECRET__OPENAI__KEY` is `openai/key`, `PIP_SECRET__SOURCE_GITHUB__TOKEN` is `source-github/token`. Each is named in the seal step of `deploy.yml`, so the step sees only these |

The deploy seals in a step of its own, after the install, so no dependency's script runs with the secrets in its environment. A new key: change the secret and deploy; devices pick it up on their next start. A new password or salt: devices ask once more.

The two secrets to start: a GitHub fine-grained token limited to this one repo, with read and write access to contents, for the source provider (optional while the repo is public); and an OpenAI key, from a project with a spend limit, for the `openai` extension.

Realtime fits the same model: the `openai` extension calls `POST /v1/realtime/client_secrets` through `kernel.fetch`, which attaches your key, and returns only the short-lived session key through `ai.realtime@1`.

## Stability

Five rules keep new features from forcing refactors.

- **Contracts are versioned, not extensions' internals.** A provider may change anything behind `records@1` as long as it still passes the contract's test suite. A breaking change ships as `records@2`, and a provider can offer both while requirers move over.
- **Contracts with a provider to hold to account ship a conformance test suite** (records, notes and questions today). Any new provider, including one Pip writes, must pass it in CI before its draft can be tried or accepted.
- **Type changes are migrations.** Splitting `place` into `venue` and `city` is a migration the records contract runs once and can reverse.
- **Nothing is overwritten or removed for good.** Every change to a record is a new revision with the earlier ones kept (`history`); changes to one record run one after another, each `update` getting it as the last left it, so two changes at once can't lose either. Deleting or merging leaves a tombstone that can be restored. Only removing an extension drops its data.
- **Derived data is disposable.** Wiki pages, records, embeddings and indexes are built from the notes extension's append-only log, so any of them can be rebuilt. A buggy extension can corrupt a view, never what you said.
- **Safe mode always works.** It belongs to the kernel and depends on no extension, so a broken shell or storage provider can always be disabled or rolled back.

## Prototype examples

One contract and three extensions show the format end to end. Names and signatures are a proposal, not a finished API.

**A contract: `records`.** Record types are registered by name once and then passed around as typed handles, so other extensions refer to a type by importing its handle, never by a string.

```ts
// contracts/records/index.ts
export const RecordRef = z.object({ type: z.string(), id: z.string() });
export const DateRange = z.object({ from: z.string().date(), to: z.string().date() });

// A record is { id, ...fields, meta: { type, created, updated, v, rev, deleted?, mergedInto? } }.
export interface RecordsV1 {
  registerType<S extends z.ZodRawShape>(name: string, fields: S): Promise<RecordType<S>>;
  get<S extends z.ZodRawShape>(type: RecordType<S>, id: string): Promise<Rec<S> | undefined>;
  // where: { kind: 'run', distanceKm: { gte: 5 }, tags: { has: 'park' } }, orderBy, order, limit
  query<S extends z.ZodRawShape>(type: RecordType<S>, q?: Query): Promise<Rec<S>[]>;
  search<S extends z.ZodRawShape>(types: RecordType<S>[], text: string): Promise<Rec<S>[]>;
  create<S extends z.ZodRawShape>(type: RecordType<S>, value: Input<S>): Promise<Rec<S>>;
  // Runs `change` on the record as it is now; the next change to it waits: no update is lost.
  update<S extends z.ZodRawShape>(type: RecordType<S>, id: string, change: (now: Rec<S>) => Input<S>): Promise<Rec<S>>;
  delete(type: RecordType, id: string): Promise<void>; // a tombstone; restore() brings it back
  merge<S extends z.ZodRawShape>(type: RecordType<S>, keep: string, merge: string): Promise<Rec<S>>;
  history<S extends z.ZodRawShape>(type: RecordType<S>, id: string): Promise<Rec<S>[]>;
  onChanged<S extends z.ZodRawShape>(type: RecordType<S>, handler: (rec: Rec<S>) => void): Promise<Unsubscribe>;
}

export const records = defineContract<RecordsV1>({ name: "records", version: "1.0.0" });
```

**Voice capture** records and transcribes with the Realtime API through `aiRealtime`, then appends to the notes log. `shell.slots.bottomBarPrimary` is a typed constant, so a misspelled slot doesn't compile.

```ts
// extensions/voice/index.ts
export default defineExtension({
  id: "voice",
  version: "1.2.0",
  requires: { notes, aiRealtime, shell },
  permissions: { device: ["microphone"] },
  agentGuide: "Captures notes. Pip never needs to call this.",
  setup({ notes, aiRealtime, shell }) {
    shell.addAction({
      id: "record",
      label: "New note",
      icon: "mic",
      slot: shell.slots.bottomBarPrimary,
      keys: [{ key: "Space", mode: "hold" }],
      async run() {
        const session = await aiRealtime.transcribe({ source: "microphone" });
        const text = await session.done();
        await notes.append({ text, source: "voice" });
      },
    });
  },
});
```

**Wiki** registers the main types, revises pages whenever a note is appended, gives Pip its tools, and provides its types to other extensions through the `wiki` contract.

```ts
// extensions/wiki/index.ts
export default defineExtension({
  id: "wiki",
  version: "2.0.0",
  provides: { wiki },
  requires: { records, notes, questions, agentTools, shell },
  agentGuide: "The source of truth for people, places and events. Cite a note for every fact.",
  setup({ records, notes, questions, agentTools, shell }) {
    const person = records.registerType("person", {
      name: z.string(),
      aliases: z.array(z.string()),
      birthday: z.string().date().optional(),
    });
    const place = records.registerType("place", {
      name: z.string(),
      area: z.string().optional(),
    });

    notes.onAppended((note) => revisePages(note, { records, questions, person, place }));

    agentTools.add({
      name: "findEntity",
      access: "read",
      input: z.object({ query: z.string() }),
      run: ({ query }) => records.search([person, place], query),
    });
    agentTools.add({
      name: "mergeEntities",
      access: "ask",
      input: z.object({ keep: RecordRef, merge: RecordRef }),
      run: ({ keep, merge }) => records.merge(keep, merge),
    });

    shell.addView({ id: "page", route: "/wiki/:id", component: PageView, embeddable: true });

    return { wiki: { person, place } };
  },
});
```

**Workouts** is what Pip would write on a `draft/workouts` branch. It is the same kind of file as Wiki; the query and the chart are ordinary functions, so nothing needs a special interpreter.

```ts
// extensions/workouts/index.ts
export default defineExtension({
  id: "workouts",
  version: "0.1.0",
  author: { kind: "agent", reason: "Runs mentioned in 6 notes since August" },
  requires: { records, wiki, extract, today, agentTools },
  setup({ records, wiki, extract, today, agentTools }) {
    const workout = records.registerType("workout", {
      kind: z.enum(["run", "gym", "swim"]),
      distanceKm: z.number().optional(),
      minutes: z.number().optional(),
      place: refTo(wiki.place).optional(),
    });

    extract.addRule({
      into: workout,
      instruction: "Exercise the person did, with distance and duration when mentioned.",
    });

    today.addSection({
      id: "weekly",
      title: "Workouts this week",
      load: async () => weeklyKm(await records.query(workout, { since: weeksAgo(6) })),
      component: WeeklyBars,
    });

    agentTools.add({
      name: "workoutsBetween",
      access: "read",
      input: z.object({ range: DateRange }),
      run: ({ range }) => records.query(workout, { date: { between: range } }),
    });
  },
});
```

Map, Git backup, the OpenAI provider and the GitHub source provider follow the same pattern. These examples are the first draft's: every contract method is async (`await records.query(...)`), and a type handle is plain data, so a reference field is `refTo(wiki.place)` rather than a method on the handle.

## UI for extensions

The draft screens are on the [Personal Agent UI canvas](https://claude.ai/artifact/DgYwb36EJbxiBHgB5TFbu1), on its Extensions page. On mobile every control sits at the bottom; on desktop every action has a key.

| Screen | Device | What it shows |
| --- | --- | --- |
| Extensions list | Mobile | Built-in and added extensions, Pip's open suggestion, and "Ask Pip for a feature" |
| Pip proposes an extension | Mobile | Workouts: the reason, a preview on real notes, what it adds, its access, Add or Not now |
| Page built from panels | Mobile | A place page whose map, visits and question panels each come from a different extension, labelled with their source |
| Extension settings | Desktop | Map: per-tool access for Pip (Read, Write, Ask me), what it adds, version history with rollback, dependants |
| Review a code change | Desktop | Map 1.3 to 1.4: why, the changes, new network access to approve, automatic checks, before and after preview, code diff |
| Map screen | Desktop | An extension's own screen, added to the sidebar by the extension itself |

Three patterns repeat across these screens:

- **Source labels.** Every panel says which extension made it, so it's always clear what turning one off would remove.
- **Proposals look like questions.** A new or changed extension is reviewed with the same Approve and Not now flow as any question from Pip.
- **Access is visible and adjustable.** What Pip may do with each extension is shown in plain words and can be changed in one tap or key.

## Decisions, build order and open questions

**Decisions.**

| Question | Decision |
| --- | --- |
| Extension format | TypeScript source exporting `defineExtension`; static fields validated with Zod. No declarative data format. |
| Where extensions live | In the repo, under `extensions/`. The browser fetches, compiles and caches them per commit. |
| Pip-written extensions | Same format and loader, on a `draft/*` branch; accepting merges it into `main`. |
| Secrets | Held by the kernel, attached only to requests for declared hosts; never in the repo, never synced. |
| Live transcription | OpenAI Realtime API, inside the `openai` extension behind `ai.realtime@1`, using a short-lived session key minted from your key. |
| Direct browser calls to OpenAI | Confirmed working in your trial project; no proxy. |
| Where extensions keep data | Through `records@1` only: the kernel gives no storage. |
| Storage for records and embeddings | An extension that provides `records@1` (`store-local`, in its own IndexedDB database). Others can replace it by passing the conformance suite in CI. |
| Sync and backup of data | Extensions, such as a Git backup requiring `notes@1` and `records@1`, kept separate from the code repo. |
| Isolation | None: every extension runs in the kernel's page, drafts too. The kernel's checks keep well-behaved code and Pip's model in line; review keeps bad code out of `main`. WebAssembly modules if isolation is ever needed. |
| Calls between extensions | Through kernel handles: personal methods, guarded functions wrapped by the policy; values pass uncopied. TypeScript checks the arguments, not the kernel. A contract is one interface, with no adapter between the two sides. |
| Pip's access | Read, write and ask attach to functions a contract guards (a tool's `run`), so no requirer can leave the guard off; the person's setting overrides the declared level. |
| What only a person may do | Contract methods marked personal pass once per tap or key in the calling extension's own screen (`kernel.asPerson`); never for the agent or an extension Pip wrote. |
| The kernel's own screens | A `kernel@1` contract the kernel provides; the screens are extensions. |
| Offline | A service worker for the kernel's files; trees and compiled output in the kernel's own database. |
| Secrets on a new device | Sealed into the page by CI with a password; the kernel asks for it once per device. |
| Turning an extension off, a draft swap | Save the change and start the app again (a page reload, from the cache); no extension is stopped one at a time. |
| Errors | Kept per extension, by the stack: at the handle boundary and for uncaught ones. |
| Several tabs | One kernel at a time, by a Web Lock; another tab takes over on request. |
| Kernel and extensions from different commits | The kernel API is versioned; an extension states the version it needs. |

**Build order.**

1. Kernel with safe mode, the in-browser compiler and loader, the handles and the secret store. **Done**, with sealed secrets.
2. The bootstrap source provider for GitHub. **Done**, with drafts: commit, merge and checks.
3. Contract packages: `records`, `notes` and `questions` with conformance suites, `ai.chat`, `ai.realtime`, `agent.tools` and `kernel`. **Done**, except `ui.shell`, which waits for the UI work. `ai.transcribe` and `ai.embed` were written and taken out again until voice or search needs them (they are in the history).
4. Foundation extensions: `store-local`, `notes`, `openai` and `agent` (**done**); `shell-mobile` and `shell-desktop` wait for the UI work.
5. Voice, Wiki and Questions, which together exercise nearly every contract. **Wiki and Questions done**; voice needs the UI (a microphone button) and the realtime spike.
6. Today, Search and Map.
7. The draft-branch flow, so Pip can write extensions. **The kernel's part is done**: trying drafts per device, review, accept; Pip's side belongs to the agent extension.

The extensions so far, each tested with the others (`startRepo` in `src/kernel/testing.ts`):

| Extension | Provides | Requires (optional) | Notes |
| --- | --- | --- | --- |
| `store-local` | `records@1` | | In its own IndexedDB database, with every revision kept and a format number for its layout; passes the records suite |
| `notes` | `notes@1` | `records` | Append-only; lists by when a note was said |
| `questions` | `questions@1` | `records` | Answers reach the asker's topic handler, also after a restart; answering is personal |
| `openai` | `ai.chat`, `ai.realtime` | | The Responses API (tool calling for current models needs it), `store: false` with the encrypted reasoning sent back as a turn's `state`; realtime keys from `/v1/realtime/client_secrets`, WebRTC at `/v1/realtime/calls`. Default models in `extensions/openai/index.ts` |
| `wiki` | `wiki@1` | `records`, `notes` (`ai.chat`, `questions`, `agent.tools`) | Person, place, event and topic types; every fact cites its notes; each note is revised into pages by the model, and what it isn't sure of becomes a yes/no question whose answer makes the change |
| `agent` | `agent@1`, `agent.tools@1` | `ai.chat` (`kernel`) | Sees a line per extension, opens only those a request needs, calls their tools through the kernel |

Where it stands (the `pip` branch): every architecture goal above has an implementation and tests, run in Node through the same boot on a test device (`src/kernel/testing.ts`), and checked in Chromium, online and offline. The compile spike: Sucrase compiles about 100 KB of TypeScript in 10 ms, cached per blob, so no CI-built cache is needed yet. The kernel bundle, with React and Zod for every extension, is 650 KB (176 KB gzipped); the compiler is a separate chunk, loaded on a cache miss.

**A rebuild, not a refactor.** The first draft planned to wrap the existing app's modules as providers and move features over one at a time. Instead (2026-10-04) Pip is a full rebuild on the `pip` branch, with the old app removed there so the two never run side by side. This iteration has two features, `notes` and `wiki`; later ones (the weekly sweep on a schedule, voice, Pip itself) are extensions on top.

**Open questions.**

- [ ] Spike: does `POST /v1/realtime/client_secrets` accept browser requests the way the other endpoints do? (It goes through `kernel.fetch` now, so CORS is the only question.) The `openai` extension is tested against a fake API only: a first run with a real key should confirm it, and the default model names.
- [x] Spike: how long does compiling every extension in the browser take, and is a CI-built cache needed from the start? (No; see above.)
- [x] How a device chooses which draft branches to load: per device, through `kernel.tryDraft` (the review screen) or safe mode.
- [ ] Views: how the shell lays out views and panels from several extensions (`ui.shell`, and its granularity: one contract, or separate ones for slots, keys and the palette). The first job of the UI work.
- [ ] Pending approvals live in memory: an `ask` call that isn't decided before the app closes fails, and Pip asks again. Persisting them needs the call to be replayable. (Postponed.)
- [ ] Postponed with it: a schema version for the kernel's own stored data (config, keep), cleaning up data left by extensions deleted from the repo, and bringing the first-draft examples above up to date.
- [ ] Not planned for now: reading files from GitHub without the API's rate limit (raw.githubusercontent or an archive per commit), and a whole-system export through the kernel for backup and sync.

**Sources:** [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
