# Vaulter — Extension Architecture

Oct 4, 2026 · @Jim · A full rebuild of the previous app, on the `pip` branch. Vaulter is the app, and the agent inside it. Reworked on Oct 5: extensions are plain modules, built by CI. On Oct 6: a core that collects what they offer.

Vaulter is a voice-first personal knowledge wiki built as extensions that import one another, around a small core that collects what each offers, where every feature, including the ones Vaulter writes itself, is an extension.

## Goal and principles

You speak notes throughout the day. Vaulter transcribes them, asks when something is unclear or contradicts what you said before, and turns the disjointed notes into curated wiki pages about people, places and events. Over time it grows into a personal assistant: a timeline of your day, a map, a calendar, and features nobody has planned yet.

Principles:

- **Extensions import one another, and the core collects what they offer.** An extension that uses another imports it and calls it. What it offers a person or Vaulter, its operations, it describes in the core's terms, and the core collects them from every extension: whatever reads them (the agent, the shell) reads them there, and no extension knows its readers. Outside the extensions are only the core, `src/core`, and the page's entry, `src/main.ts`, which keeps Vaulter to one tab.
- **Everything else is an extension**, including voice capture, the wiki, questions and search.
- **The delete test.** If the app still runs with a feature removed, that feature is an extension. Removing one is removing its folder and the imports of it, which the build and CI check.
- **One API for people and Vaulter.** Anything a person can do through an extension, Vaulter can do through the same operations, as its tools.
- **Nothing you said is ever lost.** The notes extension keeps raw notes append-only, and every fact on a wiki page cites the notes it came from.
- **Vaulter proposes, you approve.** Changes Vaulter is unsure of come to you as a question, and so does every operation Vaulter calls that rewrites what is known.

## Extensions are modules

An extension is a folder in `extensions/`: its `index.ts`, an ordinary ES module, and if it is large enough to split, an `api.ts` with the schemas and data types other extensions use (re-exported by `index.ts`). What an extension offers is the objects it exports, and their types are taken from them (`typeof notes`): there is no interface restating them. Extensions reach each other with ordinary imports, by folder: `#extensions/<id>`, the one entry in `package.json`'s `imports`.

There is one extension for each job (one keeps records, one talks to the model) and no layer of contracts over them: what an extension exports is its interface, TypeScript checks every import of it in the editor and in CI, and an operation checks its own input at runtime, once, wherever the call comes from. Keeping records elsewhere, or using another model, is a change to that extension, or a new one its importers move to: a refactor, done when it's needed.

**A library belongs to the extension that uses it.** Storage wraps Dexie and the `openai` extension wraps the AI SDK: nothing else imports either, and nothing of theirs shows in what those extensions offer, so either can move onto something else without its importers changing. Zod is the one exception: it is the language the extensions' schemas are written in, as TypeScript is for their types, so an operation's input is a Zod schema wherever it goes.

```ts
// extensions/notes/index.ts
import { collection } from '#extensions/storage';
export const NewNote = z.object({ text: z.string().trim().min(1), … });   // what comes in
export type Note = Rec<z.output<typeof NewNote>>;                        // what is kept

const kept = collection('notes/note', NewNote, ['at']);   // storage, checked and typed by the schema

const operations = { append: operation({ description, input: NewNote, run }), get, list };
export const notes = { ...operations, onAppended };   // every one an operation, for other code
export const extension = { operations } satisfies Extension;   // the ones it offers people and Vaulter
```

- **Starting is importing.** An extension's top-level code is its setup, with top-level `await` for what is async. The module graph is the start order: an extension runs once what it imports has.
- **What an extension exports** is what it offers others (`notes`, `wiki`, `model`…), and its `extension` is what it offers the core: its operations, which for the wiki are `wiki` itself. Nothing else describes it: no manifest, no version, no registration.
- **Where something is kept per extension, the caller says who it is**: a question is asked `from: 'wiki'`.
- **Zod is where data comes from outside typed code, and its type comes from the schema** (`z.infer`): an operation's input (what code passes, what Vaulter's model sends and the JSON Schema it reads, and a call a question keeps in storage, perhaps for a newer version of its operation), a model's structured answer, the sealed secrets file, and what a person types. A shape that is also an operation's input, such as a wiki page, is defined once as a schema, and the operations' inputs are made from it (`Patch`, `NewPage`). An operation checks its input once, as it is called, and nothing is cast: a record is its domain type (`Rec<T>`), with no function converting it, and operations of different inputs fit one `Record<string, Operation>` because their call's type is taken from a method.

```
 src/main.ts      the page's entry: claims the tab, then has the core start every extension
 src/core/        #core: Operation and Extension, and extensions(), which starts and collects them all
 extensions/
   storage/ notes/ questions/ secrets/ openai/ wiki/ agent/
     index.ts     the module
     api.ts       the types and schemas other extensions use, when it has many
 tools/           CI only: sealing the secrets into the built page
 tests/           every test: tests/extensions/<id>/, start.test.ts (every extension starts), and app.ts
```

**Storage** is one function: `collection(name, schema, indexes)`, a collection named by its owner (`wiki/page`), its records checked by `schema` as they are written and typed by it. Its operations are `get`, `query` (by a field's value or range, ordered by one of its indexes, limited), `create`, `update` (from the record as it is now, in one transaction, so two changes at once, even from two tabs, can't lose either), `put` and `delete`, and they are its owner's: the owner keeps them to itself, and storage offers nothing of its own. It wraps Dexie, over IndexedDB, and each collection is a database of its own.

## The core

The core, `src/core` (`#core`), is the one standard every extension is read by. It imports no extension, and no extension imports what reads it.

- **An operation** is something a person or Vaulter can do through an extension, and the way other code does it too: a function of one input (`wiki.merge({ keep, merge })`), made by `operation()` from a description, a Zod input, a `run`, and whether it `rewrites` what is known. Code calls it as it is, typed by its schema; every call is checked against the schema as it comes in, whether from code, the model or a question's choice, and answers with a promise, so a refused input is a rejection. An extension's API is its operations, with no second API beside them: the wiki's `wiki` is its operations, and `notes` adds to its operations only `onAppended`, which takes a callback.
- **Everything an extension exports that does something is an operation**, and every extension exports `extension`, the ones it offers people and Vaulter, by name (`find`, `merge`): `{ operations: wiki }` for the wiki, and `{}` for storage, secrets and the model, which only other code uses. An operation that isn't offered may take what isn't data: `notes.onAppended` takes a listener, a collection's `update` a change, `model.answer` the operations the model may call. Only what builds a value isn't one: `operation()` itself, `collection()`, `yesNo()`, and the schemas.
- **A call can be kept as data**: `Call`, `{ extension, operation, input }`, which `call()` makes once every extension has started. A question's choice holds one, so an answer makes its call even after a restart, with no asker listening.
- **The core collects them.** `extensions()` imports every folder in `extensions/` (one `import.meta.glob`, so the list is the folders, made at build time), and gives each with its id and what it offers. The page's entry calls it to start Vaulter; a reader calls it to read.
- **Readers read it when they run, not as they start.** `extensions()` settles once every extension has started, the reader too, so an extension that reads it at its top level doesn't await it.

The agent is one reader: an ordinary extension, since it depends on the model, which is an extension of its own. The shell, which owns the page and which every extension's screens go into, comes as a part of the core, with a `ui` beside `operations` in `Extension` ("The UI").

## How extensions interact

In three ways, and no others.

**Calling what another exports.** A direct import: the agent calls `questions.ask(…)` and `model.answer(…)`. TypeScript checks the call; nothing sits between the two at runtime.

**Hearing back.** A callback handed over, `notes.onAppended({ listener })` for every new note, or a call kept in a question's choice, made when the person picks it: the agent's approvals are a yes that holds the call it asked to make.

**Offering to the core.** An extension's `extension` export, which the core collects and its readers read. The wiki imports `operation` and `Extension` from `#core`, and nothing of the agent: it runs without it, and the agent finds its operations without importing it.

```
main.ts: this tab claims Vaulter, then calls the core's extensions()
   the core imports every extension: each runs once, after what it imports
   the wiki imports storage, and #core for its operations
   the agent imports openai and questions, and reads every operation from the core when it is asked
```

An extension that throws while it starts stops the start, and the page says why. A test starts every extension in `extensions/` (`tests/start.test.ts`), so an extension nothing imports yet is still checked.

## The page's entry

`src/main.ts` does the one job no extension can do for itself: one tab at a time. The first tab holds a Web Lock while it is open, and another says Vaulter is open elsewhere. Two tabs over one IndexedDB would each miss the other's changes, and records' one-change-at-a-time per record holds only within a tab. The lock comes before any extension runs, which is why `main.ts` has the core start them only once it has it. The core's own module imports none: it holds only types and the import of each folder.

**Running in the page.** Every extension runs in the page, with one copy of each module. There is no sandbox, and nothing pretends to be one: an extension can reach anything in the page, secrets included. What keeps bad code out is review before it reaches `main`. An earlier version gave every extension its own opaque-origin iframe, and a later one routed every call through kernel handles that checked callers, guarded tools and gated personal calls; both were dropped, for isolation this app doesn't need. If isolating untrusted code ever matters, the way is WebAssembly modules.

## How Vaulter uses extensions

Vaulter gains every extension's abilities automatically, because an extension's operations are written once and used by both the screens and Vaulter.

From each extension Vaulter gets:

- **Its operations** (`extension.operations`, which the agent reads from the core and names `<extension>__<operation>`): callbacks into it, each with a description that tells the model what it does and when to use it, a Zod input, and whether it rewrites what is known. The agent imports no extension's operations, and no extension imports the agent.
- **Its views**, once the shell has them: "Where was I on Tuesday?" can return the Map view filtered to Tuesday.

**Asking first.** An operation runs when the model calls it, unless it is marked `rewrites: true`: anything that rewrites what is known, such as merging pages or retracting a fact. Then Vaulter asks you first. The mark says what the operation does, not what the agent does about it: the shell will ask with the same Yes and No.

Such a call becomes a question whose yes is the call itself (`extensions/agent/index.ts`); your yes makes it, also after a restart. This is a convention, not a boundary: `questions.answer` is an operation like any other, and the model could call it, or the operation itself. Its description tells the model it is only for an answer the person gave, as when they say yes in words. Code that went around it would be caught where all code is: in review, before `main`.

**Every operation, every time.** Vaulter sees every operation, as a tool with its description, in every request. When there are enough extensions to crowd a request, it can open them one at a time instead.

## Extension lifecycle

Every extension on `main` runs. CI builds the page from it: one build, the entry and every extension together, typechecked and tested. A new extension is tried before it reaches `main` in a build of its own:

| Stage | Where | Runs on | Moves on when |
| --- | --- | --- | --- |
| Pull request | A branch | Its preview: CI builds the branch into its own copy of the page, on the same site under `previews/<branch>/`, with its own modules | CI passes (types and tests), you've tried the preview, and you review the change: what it imports, what secrets it names and where they go |
| Live | Merged into `main` | Every device, on its next start | — |

- **Writing an extension** is for now by hand. Vaulter writing them, as pull requests, comes with a focused extension for it.
- **Rollback** is a revert on `main`, which deploys.

## Secrets

Secrets are held by one extension, `secrets`, which opens them and hands them out: `secrets.secret({ name: 'openai/key' })`. It offers nothing: a secret given to the model would go out with its requests, and so would a password typed to Vaulter. The extension that uses one uses it as its service wants (`openai` sends it as a bearer token, with no credentials, referrer or redirects of the page's own). There is no wrapper around fetch: code in the page could reach any secret anyway, and the page's Content-Security-Policy is what limits where anything goes (`connect-src` this page and OpenAI, `script-src` this page only).

**Sealed in the page.** Every secret comes from CI: it seals them all into `dist/secrets.json` (`tools/seal-secrets.ts`), one file encrypted with a key derived from a password (PBKDF2, 600,000 rounds; AES-GCM), public like the rest of the page. On a device's first start the secrets extension asks for the password once, in a dialog over whatever the page shows (`extensions/secrets/dialog.ts`). It keeps only the derived key, non-extractable, in its own IndexedDB database (`secrets`), so a later deploy sealed with the same salt opens without asking; the secrets themselves are only ever in the page's memory, opened from the file at each start. A new secret, or a new value, is a new deploy.

| In this repo's settings | Kind | What |
| --- | --- | --- |
| `VAULTER_PASSWORD` | secret | The password: 16 characters at least, long and random is best, since the sealed file is public |
| `VAULTER_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`), set once: devices then take each new deploy without the password |
| `VAULTER_SECRET__<EXTENSION>__<NAME>` | secret | One per secret: `VAULTER_SECRET__OPENAI__KEY` is `openai/key`. Each is named in the seal step of `deploy.yml`, so the step sees only these |

The deploy seals in a step of its own, after the install, so no dependency's script runs with the secrets in its environment. A new key: change the secret and deploy; devices pick it up on their next start. A new password or salt: devices ask once more.

To start: an OpenAI key, from a project with a spend limit, for the `openai` extension.

Live speech will fit the same model when voice is built: the `openai` extension asks `POST /v1/realtime/client_secrets` with your key, and hands a voice extension only the short-lived session key.

## Stability

- **An extension's exports change with their importers.** Everything ships together and CI typechecks it, so nothing has a version: a change that breaks importers changes them in the same pull request.
- **An extension others build on is tested as they use it** (records, notes and questions: what they keep, in what order, what they tell listeners, and the calls their answers make), so a rewrite of one keeps what its importers rely on.
- **Record types grow without migrations, for now.** A new field is optional or has a default, so stored records still fit. Versions and migrations come with the first change that breaks stored records, not before: records is not at 1.0 yet.
- **A record is kept as it is now.** An update replaces it and a delete removes it: storage keeps no history. The notes are never changed, which is what keeps what you said. History comes back with the screen that needs it.
- **The wiki is kept, like the notes.** Pages are stored for good: they hold what was added, approved, merged and corrected, which no note says. Nothing rebuilds them from the notes. A buggy extension can still never change what you said.

## The UI

The shell, a part of the core, owns the page: the frame, the sidebar and keys on desktop, the controls at the bottom on mobile. It draws nothing of its own subject. Every screen comes from the extension it belongs to (the wiki's pages are in `extensions/wiki/`), offered as `ui` beside its `operations`, and the core collects each extension's `ui` the way it collects operations, for the shell to read:

```ts
// extensions/wiki/ui.tsx, offered in its index.ts as extension.ui
import type { Ui } from '#core';

export const ui: Ui = {
  views: [
    { id: 'person', route: '/wiki/person', title: 'People', component: PeopleList, home: 0 },
    { id: 'page', route: '/wiki/:kind/:id', title: 'Page', component: PageView, shows: 'wiki/person' },
  ],
  nav: [{ id: 'person', label: 'People', route: '/wiki/person', group: 'wiki' }],
  panels: [{ id: 'visits', target: 'wiki/place', component: Visits }],
};
```

The standard, in `#core`:

| In `Ui` | What it is | The shell |
| --- | --- | --- |
| `views` | A screen at a route (`/wiki/:kind/:id`), with a title; `home` makes it a candidate for the first screen, `shows` the collection whose records it shows, so anything can link to a record without knowing whose screen it is | routes to it, and hands it `ViewProps` |
| `nav` | An item in the navigation, in a `group`, with an optional count (`badge`) | lays it out for the device |
| `actions` | A command: the large button on mobile and the first key hint on desktop (`primary`), search, or the rest (`more`) | puts it in its slot |
| `panels` | A part of another extension's page, by collection (`target: 'wiki/place'`) | shows it on that page, labelled with the extension it came from |
| `notices` | Something asking for the person's attention on the home screen (open questions) | shows it on mobile; desktop has the counts in the navigation |

- **What only the shell knows comes as props** (`ViewProps`): `navigate`, `params`, `back`, `linkTo(record)`, sheets, and the keys a screen listens to while it shows. Data never goes through the shell: a wiki screen imports the wiki and calls it, like any other code.
- **One look.** Screens are React components built from the shared kit in `src/ui/` (`#ui`: buttons, lists, the theme), a library rather than an extension: it does nothing on its own and is never off.
- **Source labels.** Every panel says which extension made it, so it's always clear what turning one off would remove.
- **Proposals look like questions.** An operation that rewrites what is known, and a change Vaulter is unsure of, come with the same Yes and No as any question.

The draft screens are on the [Personal Agent UI canvas](https://claude.ai/artifact/DgYwb36EJbxiBHgB5TFbu1), on its Extensions page; the shell and the wiki's, questions' and secrets' screens were first built on the `pip-ui` worktree, against an earlier `ui.shell` contract whose `addView`, `addNav`, `addAction`, `addPanel` and `addNotice` become the `ui` export's lists.

## Decisions, build order and open questions

**Decisions.**

| Question | Decision |
| --- | --- |
| Extension format | An ES module (`index.ts`), with its types in `api.ts` when it has many; no manifest, no definition object, no setup function. |
| How extensions reach each other | Imports, by folder (`#extensions/<id>`). One extension per job, and no contracts over them: replacing one is a refactor. |
| What an extension offers people and Vaulter | Operations, in its `extension` export, which the core collects from every folder; the agent and the shell read them from the core, so no extension knows them. |
| Where the agent and the shell are | The shell in the core, since every extension's screens go into it. The agent an extension that reads the core, since it depends on the model, an extension of its own. |
| Where extensions live, and how they get to a device | In the repo under `extensions/`, built by CI into one page. |
| Vaulter-written extensions | Pull requests to `main`, each tried first in its own preview build of the page. |
| Turning an extension off | Not a thing: what is on `main` runs. A change is a pull request, tried in its preview. |
| Isolation | None: every extension runs in the page. Review keeps bad code out of `main`. WebAssembly modules if isolation is ever needed. |
| Who is calling | A caller names itself where something is kept per extension (a question's `from`). |
| Questions | Each choice holds the call choosing it makes, as data, made through the core when the person answers: no topics, handlers or delivery. |
| Vaulter's access | An operation runs when the model calls it, unless it rewrites what is known (`rewrites: true`): then it is a question whose yes runs the call. |
| What only a person may do | Nothing is enforced: the person answers questions on a screen, and the model can only use operations. |
| Secrets | Sealed into the page by CI with a password, asked once per device; opened into memory at each start, and attached only to requests for declared hosts. Never in the repo. |
| Where extensions keep data | `storage`'s collections (`collection(name, schema)`), over Dexie and IndexedDB, each checked by its schema as it is written, and its operations its owner's. |
| Sync and backup of data | Extensions, such as a Git backup importing notes and records, kept separate from the code repo. |
| Live transcription | OpenAI Realtime API, inside the `openai` extension, using a short-lived session key minted from your key; its interface comes with voice. |
| Direct browser calls to OpenAI | Confirmed working in your trial project; no proxy. |
| Offline | Not a goal: Vaulter is an agent, and its data is to follow you across devices. No service worker. |
| Several tabs | One at a time, by a Web Lock: another tab says Vaulter is open elsewhere. Installed as an app later, there is one window anyway. |

**Build order.**

1. The kernel. **Done**, reworked on 2026-10-05 from an in-browser compiler, loader, resolver and checked handles to importing modules built by CI, and on 2026-10-06 down to the page's entry, `src/main.ts`, and a core that collects what extensions offer, `src/core`.
2. The interfaces between extensions, first written as contracts of their own (`contracts/`, with conformance suites), moved into the extensions on 2026-10-05.
3. Foundation extensions: `storage`, `secrets`, `notes`, `openai` and `agent` (**done**); the shell waits for the UI work.
4. Voice, Wiki and Questions. **Wiki and Questions done**; voice needs the UI (a microphone button) and the realtime spike.
5. Today, Search and Map.
6. Vaulter writing extensions, as pull requests: a focused extension of its own.

The extensions so far, each tested with the others (`restart` in `tests/app.ts`):

| Extension | Exports | Imports | Notes |
| --- | --- | --- | --- |
| `storage` | `collection` | | Collections over Dexie, which only it imports, checked and typed by their schemas; tested as its importers use it |
| `secrets` | `secrets` (`secret`, `unlock`) | `storage` | Opens the page's sealed secrets, and hands each out by name |
| `notes` | `notes` | `storage` | Append-only; lists by when a note was said |
| `questions` | `questions`, `yesNo` | `storage`, `#core` | Each choice holds a call, made when it is chosen, also after a restart; a question whose call fails stays open |
| `openai` | `model` | `secrets` | `model.answer` runs the tool loop (operations in, by the names the model knows them by, an answer and its calls out) Through the AI SDK, which only it imports, over OpenAI's Responses API. Its model name is in `extensions/openai/index.ts` |
| `wiki` | `wiki`, its operations, offered as `extension` | `storage` | Pages of four kinds (person, place, event, topic) in one collection, linking each other by id; every fact cites its notes |
| `agent` | `agent` | `openai`, `questions`, and every operation from the core | Offers the model every other extension's operations, and asks before one that rewrites what is known; its own operation, `ask`, is for the shell |

**A rebuild, not a refactor.** The first draft planned to wrap the existing app's modules as extensions and move features over one at a time. Instead (2026-10-04) Vaulter is rebuilt from scratch on the `pip` branch, with the old app removed there so the two never run side by side.

**Open questions.**

- [ ] Spike: does `POST /v1/realtime/client_secrets` accept browser requests the way the other endpoints do? (CORS is the only question.) The `openai` extension is tested against a fake API only: a first run with a real key should confirm it, and the model name.
- [ ] The shell itself, and `#ui`: moving the `pip-ui` work onto the `ui` export.
- [ ] Cleaning up data left by extensions deleted from the repo.

**Sources:** [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
