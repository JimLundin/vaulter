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
| Record store | `records` contract, implemented by a storage extension such as `store-idb` | `records@1` |
| Agent loop | `agent` extension | `agent@1`, `agent.tools@1` |
| Shell | `shell-mobile` and `shell-desktop` extensions | `ui.shell@1` |
| AI provider (new) | `openai` extension | `ai.transcribe@1`, `ai.realtime@1`, `ai.chat@1`, `ai.embed@1` |

What remains are the jobs an extension can't do for itself:

| Kernel job | Why it can't be an extension |
| --- | --- |
| Fetch extension source from a source provider, compile it in the browser and cache the output per commit | Every extension, built-in or Pip's, has to arrive the same way |
| Validate each extension's definition and resolve contracts: match each `requires` to a `provides`, check versions | Extensions can't wire themselves without a referee |
| Broker every call between extensions and check its permission | An extension can't police its own access; Pip's read, write and ask settings are enforced here |
| Hold secrets and attach them to requests for declared hosts only | No extension can be trusted with another's secrets |
| Run extension code in a sandbox (Web Worker or iframe) | Isolation has to be imposed from outside |
| Choose which branch or commit to load, and roll back | Needed before any extension has loaded |
| Safe mode: a bare screen to switch branch, roll back or disable extensions | Recovery when a broken shell hides the app |

**The bootstrap set.** Before the kernel can load anything, it needs a source provider: an ordinary extension providing `extensions.source@1`, which reads extension source from the repo. It ships inside the kernel bundle, together with safe mode, and is the only extension that does. Moving to another git host means swapping this one provider. With nothing but the bootstrap set, the app boots into safe mode, asks for a repo and a token, and loads everything else from there.

**Contracts are the central idea.** Extensions never depend on each other by name. They require a contract, such as `records@1`, and any installed extension that provides it satisfies them. Moving storage from IndexedDB to an embedded database, or the AI from OpenAI to another provider, means installing a different provider. A Git backup extension simply requires `notes@1` and `records@1`.

**Contribution points are contracts too.** The kernel has no idea what a view, a tool or a record type is. The shell provides `ui.shell@1` with its slots, the agent provides `agent.tools@1`, and the records contract handles type registration. An extension adds a tool by contributing to `agent.tools@1`, exactly as it would to any other contract.

```
 ┌─────────────── extensions ───────────────┐
 │ shell-*   voice   wiki   agent   openai …│   each provides and requires contracts
 └───────┬───────────────────────────┬──────┘
         │ calls, through contracts  │
 ┌───────▼───────────────────────────▼──────┐
 │ kernel: loader · resolver · broker ·     │   source-github and safe mode ship inside it
 │         secrets · sandbox · safe mode    │
 └──────────────────────────────────────────┘
```

Extensions provide and require contracts, and every call between them passes through the kernel's broker. Pip's agent is one extension among them, so the extensions it writes are installed through the same kernel as any other.

## The extension format

Every extension is TypeScript source in the repo, exporting one `defineExtension({...})`. There is no second format: an extension Pip writes is the same kind of folder, on a branch.

```
src/kernel/              kernel and safe mode (the only built bundle)
contracts/
  records/               interface, Zod schemas, conformance tests
  ui.shell/
  agent.tools/
extensions/
  source-github/         bootstrap: ships inside the kernel bundle
  store-idb/
  wiki/
    index.ts             export default defineExtension({...})
    revise.ts
    views/Page.tsx
    wiki.test.ts
```

The definition has two parts:

| Part | Holds | Read by |
| --- | --- | --- |
| Static fields: `id`, `version`, `requires`, `provides`, `permissions`, `secrets`, `agentGuide` | Plain values | The kernel before any code runs, and the review screen |
| `setup(ctx)` | Code that registers types, tools, views and handlers through the contracts it requires | Runs in the sandbox once the kernel has accepted the static part |

`ctx` contains typed handles only for the contracts listed in `requires`. Calling anything else fails to compile, and the broker refuses it at runtime as well.

**A contract is a TypeScript package** in `contracts/`: its interface, Zod schemas for every input, and a conformance test suite for providers. A misspelled slot, a missing method or a wrong argument is a type error in your editor and in CI. Tool input schemas for Pip are generated from the same Zod schemas, so there is no hand-written JSON and no string mini-language anywhere.

**Checks happen at three points.**

- TypeScript, in the editor and in CI on every push.
- Zod, when the kernel loads an extension's static fields and on every call through the broker.
- Conformance tests, before a provider can satisfy a `requires`.

**Isolation.** Each extension's data lives in its own namespace with the storage provider. It reaches anything else only through contracts it requires and has permission to call, so removing it removes its namespace and nothing else.

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

You can tighten or loosen any tool in that extension's settings. The kernel's broker enforces these on every call, so neither an extension nor the agent extension itself can go around them.

**Only load what is relevant.** Pip always sees a one-line summary of each installed extension. It loads an extension's full tools and guide only when the task needs it, so twenty extensions don't crowd every request. Recording a note about a café pulls in Map; asking about next week pulls in Calendar.

## Extension lifecycle

The repo is where every extension lives, and every extension goes through the same loader. A Pip-written extension isn't a different kind of thing, just one that hasn't reached `main` yet.

| Stage | Source is on | Runs on | Moves on when |
| --- | --- | --- | --- |
| Draft | A branch, such as `draft/workouts`, written by Pip | Devices where you've chosen to try that branch | Pip has a working version and CI type checks pass |
| Trial | The same branch, with more commits as Pip iterates | The same devices | You approve it on the review screen |
| Accept | Merged into `main`, or a pull request if you want a second look | — | The merge lands |
| Live | `main` | Every device, on its next start | — |

The code, compiler, loader and contracts are the same at every stage; only the branch changes. Because drafts live in git, they survive a cleared browser cache and appear on your other devices.

- **Rollback** is reverting the merge, or pinning the app to an earlier commit from safe mode.
- **Startup** compiles each extension once per commit and caches the result. If that gets slow, CI can publish compiled output beside the source, and the loader uses it when present.
- **Offline,** the PWA cache serves the last compiled version, so the app opens without reaching GitHub.
- **Pip gets no special access.** Its extension's permissions and secrets are part of what you review, and raising them later takes a new draft.

## Secrets

Secrets are held by the kernel, never by an extension. An extension declares which secrets it needs and the hosts each one is for. The kernel asks you once, stores the value encrypted in the browser, and attaches it only to requests the extension makes through the kernel to those hosts. The extension never sees the raw value, so a draft Pip writes can't read your GitHub token, even by mistake.

Secrets never go into the repo and never sync between devices. A new device needs two to start:

1. A GitHub fine-grained token limited to this one repo, with read and write access to contents, for the source provider.
2. Your OpenAI key, for the `openai` extension.

Realtime fits the same model: the kernel calls `POST /v1/realtime/client_secrets` with your key, and the voice extension receives only the short-lived session key.

## Stability

Five rules keep new features from forcing refactors.

- **Contracts are versioned, not extensions' internals.** A provider may change anything behind `records@1` as long as it still passes the contract's test suite. A breaking change ships as `records@2`, and a provider can offer both while requirers move over.
- **Every contract ships a conformance test suite.** Any new provider, including one Pip writes, must pass it before it can satisfy a `requires`.
- **Type changes are migrations.** Splitting `place` into `venue` and `city` is a migration the records contract runs once, logs and can reverse. Data is never just overwritten.
- **Derived data is disposable.** Wiki pages, records, embeddings and indexes are built from the notes extension's append-only log, so any of them can be rebuilt. A buggy extension can corrupt a view, never what you said.
- **Safe mode always works.** It belongs to the kernel and depends on no extension, so a broken shell or storage provider can always be disabled or rolled back.

## Prototype examples

One contract and three extensions show the format end to end. Names and signatures are a proposal, not a finished API.

**A contract: `records`.** Record types are registered by name once and then passed around as typed handles, so other extensions refer to a type by importing its handle, never by a string.

```ts
// contracts/records/index.ts
export const RecordRef = z.object({ type: z.string(), id: z.string() });
export const DateRange = z.object({ from: z.string().date(), to: z.string().date() });

export interface RecordsV1 {
  registerType<S extends z.ZodRawShape>(name: string, fields: S): RecordType<S>;
  query<S extends z.ZodRawShape>(type: RecordType<S>, where?: Where<S>): Promise<Rec<S>[]>;
  search(types: RecordType<any>[], text: string): Promise<Rec<any>[]>;
  put<S extends z.ZodRawShape>(type: RecordType<S>, value: Input<S>): Promise<Rec<S>>;
  merge(keep: z.infer<typeof RecordRef>, merge: z.infer<typeof RecordRef>): Promise<void>;
  onCreated<S extends z.ZodRawShape>(type: RecordType<S>, handler: (rec: Rec<S>) => void): Unsubscribe;
}

export const records = defineContract<RecordsV1>({ name: "records", version: "1.2.0" });
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
      place: wiki.place.ref().optional(),
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

Map, Git backup, the OpenAI provider and the GitHub source provider follow the same pattern.

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
| Storage for records and embeddings | An extension that provides `records@1`. IndexedDB first; others can replace it. |
| Sync and backup of data | Extensions, such as a Git backup requiring `notes@1` and `records@1`, kept separate from the code repo. |

**Build order.**

1. Kernel with safe mode, the in-browser compiler and loader, the broker and the secret store.
2. The bootstrap source provider for GitHub.

Progress (on the `pip` branch):

- Step 1, in `src/kernel/`: contracts and versions (`contract.ts`), definitions with Zod-checked static fields (`extension.ts`), the resolver (`resolve.ts`), the broker with its gate for Pip's read, write and ask (`broker.ts`), per-caller providers for namespaces (`per-caller.ts`), secrets and the kernel's `fetch` (`secrets.ts`, `idb.ts`), the compiler (`compile.ts`: Sucrase and es-module-lexer, loaded only on a cache miss) and the loader (`loader.ts`: compiled output cached by blob sha, linked into blob: modules), start-up with offline fallback (`start.ts`) and safe mode (`safe-mode.ts`). Not yet: the sandbox (extensions run in the page), and running conformance suites before accepting a provider (they run in CI).
- Step 2: `source-github`, and `source-dev` for `npm run dev`.
- Step 3: `extensions.source`, `records` (with its conformance suite), `notes` and `ui.shell`. Not yet: `ai.*`, `agent.tools`, `questions`.
- Steps 4 and 5, first cut: `store-idb`, `notes`, one responsive `shell` (the split into `shell-mobile` and `shell-desktop` waits until they differ by more than CSS), and `wiki` with hand-written pages citing notes.

The compile spike's answer: Sucrase compiles about 100 KB of TypeScript in 10 ms, and output is cached per blob, so a new commit recompiles only what changed; no CI-built cache is needed yet. The kernel bundle is 625 KB (167 KB gzipped), most of it React DOM and Zod, which extensions share whole.
3. Contract packages with conformance tests: `records`, `notes`, `ui.shell`, `ai.*`, `agent.tools`, `questions`.
4. Foundation extensions: `store-idb`, `notes`, `openai`, `shell-mobile`, `shell-desktop`, `agent`.
5. Voice, Wiki and Questions, which together exercise nearly every contract.
6. Today, Search and Map.
7. The draft-branch flow, so Pip can write extensions.

**A rebuild, not a refactor.** The first draft planned to wrap the existing app's modules as providers and move features over one at a time. Instead (2026-10-04) Pip is a full rebuild on the `pip` branch, with the old app removed there so the two never run side by side. This iteration has two features, `notes` and `wiki`; later ones (the weekly sweep on a schedule, voice, Pip itself) are extensions on top.

**Open questions.**

- [ ] Spike: does `POST /v1/realtime/client_secrets` accept browser requests the way the other endpoints do?
- [x] Spike: how long does compiling every extension in the browser take, and is a CI-built cache needed from the start? (No; see Progress.)
- [ ] Contract granularity: one `ui.shell` contract, or separate ones for slots, keys and the palette?
- [ ] How a device chooses which draft branches to load: per device in safe mode, or per draft on the review screen.

**Sources:** [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
