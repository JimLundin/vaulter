# Vaulter — Extension Architecture

Oct 4, 2026 · @Jim · A full rebuild of the previous app, on the `pip` branch. Vaulter is the app, and the agent inside it. Reworked on Oct 5: extensions are plain modules, built by CI.

Vaulter is a voice-first personal knowledge wiki built as a small kernel plus extensions, where every feature, including the ones Vaulter writes itself, is an extension.

## Goal and principles

You speak notes throughout the day. Vaulter transcribes them, asks when something is unclear or contradicts what you said before, and turns the disjointed notes into curated wiki pages about people, places and events. Over time it grows into a personal assistant: a timeline of your day, a map, a calendar, and features nobody has planned yet.

Principles:

- **Extensions import one another.** There is no registry, no discovery and no hooks: an extension that uses another imports it and calls it. The kernel only keeps Vaulter to one tab and holds a few shared helpers.
- **Everything else is an extension**, including voice capture, the wiki, questions and search.
- **The delete test.** If the app still runs with a feature removed, that feature is an extension. Removing one is removing its folder and the imports of it, which the build and CI check.
- **One API for people and Vaulter.** Anything a person can do through an extension, Vaulter can do through the same functions, as its tools.
- **Nothing you said is ever lost.** The notes extension keeps raw notes append-only, and every fact on a wiki page cites the notes it came from.
- **Vaulter proposes, you approve.** Changes Vaulter is unsure of come to you as a question, and so does every tool call that asks first.

## Extensions are modules

An extension is a folder in `extensions/`: its `index.ts`, an ordinary ES module, and if it is large enough to split, an `api.ts` with the schemas and data types other extensions use (re-exported by `index.ts`). What an extension offers is the objects it exports, and their types are taken from them (`typeof notes`): there is no interface restating them. Extensions reach each other with ordinary imports, by folder: `#extensions/<id>`, the one wildcard in `package.json`'s `imports`, beside `#kernel`.

There is one extension for each job (one keeps records, one talks to the model) and no layer of contracts over them: what an extension exports is its interface, TypeScript checks every import of it in the editor and in CI, and nothing checks arguments at runtime. Keeping records elsewhere, or using another model, is a change to that extension, or a new one its importers move to: a refactor, done when it's needed.

```ts
// extensions/notes/index.ts
import { collection } from '#extensions/storage';
export const NewNote = z.object({ text: z.string().trim().min(1), … });   // what comes in
export type Note = Rec<z.output<typeof NewNote>>;                        // what is kept

const kept = collection<z.output<typeof NewNote>>('notes/note');   // storage, typed by what it holds

export const notes = { append, get, list, onAppended };   // what it offers
export const tools = […];   // for the agent, which imports them
```

- **Starting is importing.** An extension's top-level code is its setup, with top-level `await` for what is async. The module graph is the start order: an extension runs once what it imports has.
- **What an extension exports** is what it offers others (`notes`, `wiki`, `model`, the wiki's `tools`…). Nothing else describes it: no manifest, no version, no registration.
- **Where something is kept per extension, the caller says who it is**: `questionsFor('wiki')`.
- **Zod is where data comes from outside typed code, and its type comes from the schema** (`z.infer`): a tool's input (what Vaulter's model sends, and the JSON Schema it reads), a model's structured answer, OpenAI's responses, the sealed secrets file, what a person types, and a question's `data`, which comes back from storage to its asker, perhaps a newer version of it. A shape that is also a tool's input, such as a wiki page, is defined once as a schema, and the tools' inputs are made from it (`Patch`, `NewPage`). Inside typed code nothing is checked again, and nothing is cast: a record is its domain type (`Rec<T>`), with no function converting it, and a list of tools of different inputs fits `Tool[]` because `run` is a method.

```
 src/kernel/      one tab at a time, and helpers (#kernel: omit, queue, messageOf)
 src/main.ts      claims the tab, then imports the agent, which imports the rest
 extensions/
   storage/ notes/ questions/ secrets/ openai/ wiki/ agent/
     index.ts     the module
     api.ts       the types and schemas other extensions use, when it has many
 tools/           CI only: sealing the secrets into the built page
 tests/           every test: tests/kernel/, tests/extensions/<id>/, start.test.ts (every extension starts), and app.ts
```

**Storage** is one function: `collection<T>(name)`, a collection named by its owner (`wiki/page`) and typed by what it holds, with `get`, `query` (by a field's value or range, ordered, limited), `search` (by the words in its text fields), `create`, `update` (one change at a time, from the record as it is now) and `delete` (a tombstone). Every revision is kept.

## How extensions interact

In two ways, and no others.

**Calling what another exports.** A direct import: the wiki calls `notes.get(id)` and `model.json(…)`, and the agent imports the wiki's `tools`. TypeScript checks the call; nothing sits between the two at runtime.

**Hearing back.** A callback handed over: `notes.onAppended(note => …)` for every new note; `questions.handle('revise', answer => …)` for the answers to the questions an extension asked under its own topic, also after a restart.

Tool types are imported with `import type`, which leaves nothing behind at runtime: the wiki's `tools` don't load the agent, and the wiki runs without it.

```
main.ts: this tab claims Vaulter, then imports the agent
   the agent imports openai, questions and the wiki's tools
   the wiki imports storage, notes, questions, openai: each runs once, before what imports it
   the wiki's top level subscribes to notes and handles its answers
```

An extension that throws while it starts stops the start, and the page says why. A test starts every extension in `extensions/` (`tests/start.test.ts`), so an extension nothing imports yet is still checked.

## The kernel

What is left is the one job no extension can do for itself (`src/kernel/single-tab.ts`): one tab at a time. The first tab holds a Web Lock while it is open, and another says Vaulter is open elsewhere. Two tabs over one IndexedDB would each miss the other's changes, and records' one-change-at-a-time per record holds only within a tab. The lock comes before any extension runs, which is why `main.ts` imports the agent only once it has it: the page's one dynamic import.

`#kernel` is also where the helpers every extension may use live: `omit`, `queue` (tasks one after another) and `messageOf`.

**Running in the page.** Every extension runs in the page, with one copy of each module. There is no sandbox, and nothing pretends to be one: an extension can reach anything in the page, secrets included. What keeps bad code out is review before it reaches `main`. An earlier version gave every extension its own opaque-origin iframe, and a later one routed every call through kernel handles that checked callers, guarded tools and gated personal calls; both were dropped, for isolation this app doesn't need. If isolating untrusted code ever matters, the way is WebAssembly modules.

## How Vaulter uses extensions

Vaulter gains every extension's abilities automatically, because an extension's tools are written once and used by both the screens and Vaulter.

From each extension Vaulter gets:

- **Its tools** (`export const tools`, imported by the agent and listed in `extensions/agent/index.ts`): callbacks into it, each with a description that tells the model what it does and when to use it, a Zod input and an access level.
- **Its views**, once the shell has them: "Where was I on Tuesday?" can return the Map view filtered to Tuesday.

**Access per tool.** The agent applies it to every call its model makes:

| Access | Vaulter's behaviour | Typical use |
| --- | --- | --- |
| `read` | Runs it | Queries, search, look-ups |
| `write` | Runs it, and it shows in the answer's calls | Adding a fact with a clear source |
| `ask` | Asks you first, as a question: the call runs when you say yes | Merging people, retracting a fact, anything uncertain |

An `ask` call becomes a question on the agent's own topic (`extensions/agent/index.ts`), with the call as its data; your yes runs it, also after a restart. The model only acts through tools, and no tool answers questions, so this is the whole boundary. An extension Vaulter writes that tried to answer its own questions would be caught where all code is: in review, before `main`.

**Every tool, every time.** Vaulter sees every tool, with its description, in every request. When there are enough extensions to crowd a request, it can open them one at a time instead.

## Extension lifecycle

Every extension on `main` runs. CI builds the page from it: one build, the kernel and every extension together, typechecked and tested. A new extension is tried before it reaches `main` in a build of its own:

| Stage | Where | Runs on | Moves on when |
| --- | --- | --- | --- |
| Pull request | A branch | Its preview: CI builds the branch into its own copy of the page, on the same site under `previews/<branch>/`, with its own kernel and modules | CI passes (types and tests), you've tried the preview, and you review the change: what it imports, what secrets it names and where they go |
| Live | Merged into `main` | Every device, on its next start | — |

- **Writing an extension** is for now by hand. Vaulter writing them, as pull requests, comes with a focused extension for it.
- **Rollback** is a revert on `main`, which deploys.

## Secrets

Secrets are held by one extension, `secrets`, which opens them and hands them out: `secret('openai/key')`. The extension that uses one uses it as its service wants (`openai` sends it as a bearer token, with no credentials, referrer or redirects of the page's own). There is no wrapper around fetch: code in the page could reach any secret anyway, and the page's Content-Security-Policy is what limits where anything goes (`connect-src` this page and OpenAI, `script-src` this page only).

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
- **An extension others build on is tested as they use it** (records, notes and questions: what they keep, in what order, what they tell listeners), so a rewrite of one keeps what its importers rely on.
- **Record types grow without migrations, for now.** A new field is optional or has a default, so stored records still fit. Versions and migrations come with the first change that breaks stored records, not before: records is not at 1.0 yet.
- **Nothing is overwritten or removed for good.** Every change to a record is a new revision, and storage keeps the earlier ones; changes to one record run one after another, each `update` getting it as the last left it, so two changes at once can't lose either. Deleting leaves a tombstone. Reading the earlier revisions and tombstones back comes with the screen that needs it. Only removing an extension drops its data.
- **The wiki is kept, like the notes.** Each note is revised into the wiki once, when it is appended, and the pages are stored for good, with every revision: they also hold what the person approved, merged and corrected, which no note says. Nothing rebuilds them from the notes. A buggy extension can still never change what you said.

## The UI

One extension, `shell`, owns the page: the frame, the sidebar and keys on desktop, the controls at the bottom on mobile. It draws nothing of its own subject. Every screen comes from the extension it belongs to (the wiki's pages are in `extensions/wiki/`), exported as `ui`, and the shell imports each extension's `ui` the way the agent imports its `tools`:

```ts
// extensions/wiki/ui.tsx, exported from its index.ts
import type { Ui } from '#extensions/shell';

export const ui: Ui = {
  views: [
    { id: 'person', route: '/wiki/person', title: 'People', component: PeopleList, home: 0 },
    { id: 'page', route: '/wiki/:kind/:id', title: 'Page', component: PageView, shows: 'wiki/person' },
  ],
  nav: [{ id: 'person', label: 'People', route: '/wiki/person', group: 'wiki' }],
  panels: [{ id: 'visits', target: 'wiki/place', component: Visits }],
};
```

The standard, in `extensions/shell/api.ts`:

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
- **Proposals look like questions.** A tool call that asks first, and a change Vaulter is unsure of, come with the same Yes and No as any question.

The draft screens are on the [Personal Agent UI canvas](https://claude.ai/artifact/DgYwb36EJbxiBHgB5TFbu1), on its Extensions page; the shell and the wiki's, questions' and secrets' screens were first built on the `pip-ui` worktree, against an earlier `ui.shell` contract whose `addView`, `addNav`, `addAction`, `addPanel` and `addNotice` become the `ui` export's lists.

## Decisions, build order and open questions

**Decisions.**

| Question | Decision |
| --- | --- |
| Extension format | An ES module (`index.ts`), with its types in `api.ts` when it has many; no manifest, no definition object, no setup function. |
| How extensions reach each other | Imports, by folder (`#extensions/<id>`). One extension per job, and no contracts over them: replacing one is a refactor. |
| Where extensions live, and how they get to a device | In the repo under `extensions/`, built by CI with the kernel into one page. |
| Vaulter-written extensions | Pull requests to `main`, each tried first in its own preview build of the page. |
| Turning an extension off | Not a thing: what is on `main` runs. A change is a pull request, tried in its preview. |
| Isolation | None: every extension runs in the page. Review keeps bad code out of `main`. WebAssembly modules if isolation is ever needed. |
| Who is calling | A caller names itself where something is kept per extension (`questionsFor('wiki')`). |
| Vaulter's access | Each tool declares `read`, `write` or `ask`; the agent applies it, and `ask` is a question whose yes runs the call. |
| What only a person may do | Nothing is enforced: the person answers questions on a screen, and the model can only use tools. |
| Secrets | Sealed into the page by CI with a password, asked once per device; opened into memory at each start, and attached only to requests for declared hosts. Never in the repo. |
| Where extensions keep data | `storage`'s typed collections (`collection<T>(name)`), in its own IndexedDB database; storage checks nothing, what comes from outside is checked where it comes in. |
| Sync and backup of data | Extensions, such as a Git backup importing notes and records, kept separate from the code repo. |
| Live transcription | OpenAI Realtime API, inside the `openai` extension, using a short-lived session key minted from your key; its interface comes with voice. |
| Direct browser calls to OpenAI | Confirmed working in your trial project; no proxy. |
| Offline | Not a goal: Vaulter is an agent, and its data is to follow you across devices. No service worker. |
| Several tabs | One at a time, by a Web Lock: another tab says Vaulter is open elsewhere. Installed as an app later, there is one window anyway. |

**Build order.**

1. The kernel. **Done**, reworked on 2026-10-05 from an in-browser compiler, loader, resolver and checked handles to importing modules built by CI.
2. The interfaces between extensions, first written as contracts of their own (`contracts/`, with conformance suites), moved into the extensions on 2026-10-05.
3. Foundation extensions: `storage`, `secrets`, `notes`, `openai` and `agent` (**done**); the shell waits for the UI work.
4. Voice, Wiki and Questions. **Wiki and Questions done**; voice needs the UI (a microphone button) and the realtime spike.
5. Today, Search and Map.
6. Vaulter writing extensions, as pull requests: a focused extension of its own.

The extensions so far, each tested with the others (`restart` in `tests/app.ts`):

| Extension | Exports | Imports | Notes |
| --- | --- | --- | --- |
| `storage` | `collection`, `idbStore` | | Typed collections in its own IndexedDB database, with every revision kept, and search; tested as its importers use it |
| `secrets` | `secret`, `unlock` | `storage` | Opens the page's sealed secrets, and hands each out by name |
| `notes` | `notes` | `storage` | Append-only; lists by when a note was said |
| `questions` | `questionsFor` | `storage` | Answers reach the asker's topic handler, also after a restart |
| `openai` | `model` | `secrets` | `model.answer` runs the tool loop (functions in, an answer and its calls out), `model.json` gives a structured answer checked against its Zod schema. Over the Responses API, `store: false`, with the encrypted reasoning sent back each turn; the wire format stays inside. Its model name is in `extensions/openai/index.ts` |
| `wiki` | `wiki`, `tools` | `storage`, `notes`, `questions`, `openai` | Pages of four kinds (person, place, event, topic) in one collection, linking each other by id; every fact cites its notes; each note is revised into pages by the model, and what it isn't sure of becomes a yes/no question whose answer makes the change |
| `agent` | `agent` | `openai`, `questions`, `wiki` | Has the tools it imports, and asks before a tool that asks first |

**A rebuild, not a refactor.** The first draft planned to wrap the existing app's modules as extensions and move features over one at a time. Instead (2026-10-04) Vaulter is rebuilt from scratch on the `pip` branch, with the old app removed there so the two never run side by side.

**Open questions.**

- [ ] Spike: does `POST /v1/realtime/client_secrets` accept browser requests the way the other endpoints do? (CORS is the only question.) The `openai` extension is tested against a fake API only: a first run with a real key should confirm it, and the model name.
- [ ] The shell itself, and `#ui`: moving the `pip-ui` work onto the `ui` export.
- [ ] Cleaning up data left by extensions deleted from the repo.

**Sources:** [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
