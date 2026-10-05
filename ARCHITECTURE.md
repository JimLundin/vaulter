# Vaulter — Extension Architecture

Oct 4, 2026 · @Jim · A full rebuild of the previous app, on the `pip` branch. Vaulter is the app, and the agent inside it. Reworked on Oct 5: extensions are plain modules, built by CI.

Vaulter is a voice-first personal knowledge wiki built as a small kernel plus extensions, where every feature, including the ones Vaulter writes itself, is an extension.

## Goal and principles

You speak notes throughout the day. Vaulter transcribes them, asks when something is unclear or contradicts what you said before, and turns the disjointed notes into curated wiki pages about people, places and events. Over time it grows into a personal assistant: a timeline of your day, a map, a calendar, and features nobody has planned yet.

Principles:

- **The kernel only chooses which extensions run.** It stores no notes, runs no agent, draws no screens and wires nothing: extensions import one another.
- **Everything else is an extension**, including voice capture, the wiki, questions and search.
- **The delete test.** If the app still runs with a feature removed, that feature is an extension. Removing one is removing its folder and the imports of it, which the build and CI check.
- **One API for people and Vaulter.** Anything a person can do through an extension, Vaulter can do through the same functions, as its tools.
- **Nothing you said is ever lost.** The notes extension keeps raw notes append-only; every page and record built from them can be rebuilt.
- **Vaulter proposes, you approve.** Changes Vaulter is unsure of come to you as a question, and so does every tool call that asks first.

## Extensions are modules

An extension is a folder in `extensions/`: its `index.ts`, an ordinary ES module, an `api.ts` with the types and Zod schemas other extensions use (re-exported by `index.ts`), and an `about.ts` the kernel reads before running any of it. Extensions reach each other with ordinary imports, by folder: `#extensions/<id>`, the one wildcard in `package.json`'s `imports`, beside `#kernel`.

There is one extension for each job (one keeps records, one talks to the model) and no layer of contracts over them: what an extension exports is its interface, TypeScript checks every import of it in the editor and in CI, and nothing checks arguments at runtime. Keeping records elsewhere, or using another model, is a change to that extension, or a new one its importers move to: a refactor, done when it's needed.

```ts
// extensions/notes/index.ts
import { recordsFor } from '#extensions/storage';
import { NewNote, type Notes } from './api.ts';

const records = recordsFor('notes');          // a caller names itself
const note = await records.registerType('note', { ...NewNote.shape, at: z.iso.datetime() });

export const notes: Notes = { append, get, list, onAppended };
```

```ts
// extensions/notes/about.ts
export const about: About = {
  version: '1.0.0',
  agentGuide: 'The log of what the person said or typed, never changed. Cite a note by its id.',
};
```

- **Starting is importing.** An extension's top-level code is its setup, with top-level `await` for what is async. The module graph is the start order: an extension runs once what it imports has.
- **An extension that keeps something per caller** takes the caller's id: `recordsFor('wiki')`, `questionsFor('wiki')`, `netFor('openai', about)`.
- **What an extension may export:** what it provides (`notes`, `wiki`, `chat`…), `tools` for Vaulter, and, for the one shell, `shell`.
- **`about.ts`** holds `version`, `agentGuide`, `preview`, and its `secrets` with the hosts each is for. It has no imports but the type, so the kernel reads every one before importing anything.
- **Zod is for what doesn't come from typed code**: a tool's input (what Vaulter's model sends, and the JSON Schema it reads), a record type's fields (what is stored), a model's structured answer, and what a person types.

```
 src/kernel/      the kernel: what is on, the extensions list, one tab at a time
 src/main.ts      every extensions/*/about.ts, and every extensions/*/index.ts as a lazy import
 extensions/
   storage/ notes/ questions/ secrets/ openai/ wiki/ agent/
     about.ts     read first
     index.ts     the module
     api.ts       the types and schemas other extensions use
 tools/           CI only: sealing the secrets into the built page
 tests/           every test: tests/kernel/, tests/extensions/<id>/, and app.ts to start the app in one
```

## The kernel

What is left are the jobs no extension can do for itself (`src/kernel`, under 300 lines):

| Kernel job | Why it can't be an extension |
| --- | --- |
| Import the extensions this device has on (`kernel.ts`), and list every extension with its status | Nothing has run yet to decide it |
| Keep this device's choices of what is on, in `localStorage`; `?reset` forgets them | A preview that breaks the shell would otherwise leave no way back |
| One tab at a time (`single-tab.ts`): the first holds a Web Lock while it is open, and another says Vaulter is open elsewhere | Two tabs over one IndexedDB would each miss the other's changes, and records' one-change-at-a-time per record holds only within a tab |
| Hand the page to the shell, or say there is none | Before any screen exists |

Extensions use the kernel as `#kernel`: `extensions()`, `running()` (each running extension's `about` and exports: how the agent finds every extension's tools), `started` (once everything that is on has started) and `setEnabled`. An extension that fails to start is listed as failed, with why.

**On, off and previews.** An extension is on unless this device turned it off, and a preview (`preview: true` in its `about.ts`) is off until a device turns it on. Turning one on or off saves the choice and reloads the page. An extension that another one imports loads with it, whether it is on or not: off means the kernel doesn't import it itself. So a preview is something at the edge, such as a new screen or new tools; changing what others import is a change merged to `main`.

**Running in the page.** Every extension runs in the page, with one copy of each module. There is no sandbox, and nothing pretends to be one: an extension can reach anything in the page, secrets included. What keeps bad code out is review before it reaches `main`. An earlier version gave every extension its own opaque-origin iframe, and a later one routed every call through kernel handles that checked callers, guarded tools and gated personal calls; both were dropped, for isolation this app doesn't need. If isolating untrusted code ever matters, the way is WebAssembly modules.

**Starting again is the page's job.** Nothing stops one extension at a time. Turning an extension on or off, or removing one, saves the change and reloads the page.

## How Vaulter uses extensions

Vaulter gains every extension's abilities automatically, because an extension's tools are written once and used by both the screens and Vaulter.

From each extension Vaulter gets:

- **Its tools** (`export const tools`), each with a Zod input and an access level.
- **Its agent guide**, telling Vaulter when the extension is the right one to use.
- **Its views**, once the shell has them: "Where was I on Tuesday?" can return the Map view filtered to Tuesday.

**Access per tool.** The agent applies it to every call its model makes:

| Access | Vaulter's behaviour | Typical use |
| --- | --- | --- |
| `read` | Runs it | Queries, search, look-ups |
| `write` | Runs it, and it shows in the answer's steps | Adding a fact with a clear source |
| `ask` | Asks you first, as a question: the call runs when you say yes | Merging people, retracting a fact, anything uncertain |

An `ask` call becomes a question on the agent's own topic (`extensions/agent/catalog.ts`), with the call as its data; your yes runs it, also after a restart. The model only acts through tools, and no tool answers questions, so this is the whole boundary. An extension Vaulter writes that tried to answer its own questions would be caught where all code is: in review, before `main`.

**Every tool, every time.** Vaulter sees each extension's guide and all of its tools in every request. When there are enough extensions to crowd a request, it can open them one at a time instead.

## Extension lifecycle

Every extension lives on `main`, and CI builds the page from it: one build, the kernel and every extension together, typechecked and tested.

| Stage | Where | Runs on | Moves on when |
| --- | --- | --- | --- |
| Pull request | A branch, with the new extension marked `preview: true` | Nowhere yet | CI passes (types and tests) and you review it: what it imports, its hosts and secrets in `about.ts` |
| Preview | Merged into `main` and deployed | Devices that turn it on | You've tried it |
| Live | `preview` removed | Every device, on its next start | — |

- **Writing an extension** is for now by hand. Vaulter writing them, as pull requests, comes with a focused extension for it.
- **Rollback** is a revert on `main`, which deploys. A device a preview has left without a working screen opens `?reset`.

## Secrets

Secrets are held by one extension, `secrets`, never by the extension that uses them. An extension declares in its `about.ts` the secrets it needs and the hosts each one is for; it takes its own net with `netFor(id, about)` and asks `net.fetch(url, { secret: 'key' })`, and the secrets extension attaches the value only to requests for those hosts (https only, no credentials, no redirects). Code in the page could reach the secrets directly, so this keeps well-behaved extensions from handling secrets at all, rather than walling them off; the page's Content-Security-Policy is what limits where anything goes (`connect-src` this page and OpenAI, `script-src` this page only).

**Sealed in the page.** Every secret comes from CI: it seals them all into `dist/secrets.json` (`tools/seal-secrets.ts`), one file encrypted with a key derived from a password (PBKDF2, 600,000 rounds; AES-GCM), public like the rest of the page. On a device's first start the secrets extension asks for the password once, in a dialog over whatever the page shows (`extensions/secrets/dialog.ts`). It keeps only the derived key, non-extractable, in its own IndexedDB database (`secrets`), so a later deploy sealed with the same salt opens without asking; the secrets themselves are only ever in the page's memory, opened from the file at each start. A new secret, or a new value, is a new deploy.

| In this repo's settings | Kind | What |
| --- | --- | --- |
| `VAULTER_PASSWORD` | secret | The password: 16 characters at least, long and random is best, since the sealed file is public |
| `VAULTER_SALT` | variable | 16 random bytes, base64 (`openssl rand -base64 16`), set once: devices then take each new deploy without the password |
| `VAULTER_SECRET__<EXTENSION>__<NAME>` | secret | One per secret: `VAULTER_SECRET__OPENAI__KEY` is `openai/key`. Each is named in the seal step of `deploy.yml`, so the step sees only these |

The deploy seals in a step of its own, after the install, so no dependency's script runs with the secrets in its environment. A new key: change the secret and deploy; devices pick it up on their next start. A new password or salt: devices ask once more.

To start: an OpenAI key, from a project with a spend limit, for the `openai` extension.

Live speech will fit the same model when voice is built: the `openai` extension asks `POST /v1/realtime/client_secrets` through `net.fetch`, which attaches your key, and hands a voice extension only the short-lived session key.

## Stability

- **An extension's exports change with their importers.** Everything ships together and CI typechecks it, so nothing has a version: a change that breaks importers changes them in the same pull request.
- **An extension others build on is tested as they use it** (records, notes and questions: what they keep, in what order, what they tell listeners), so a rewrite of one keeps what its importers rely on.
- **Record types grow without migrations, for now.** A new field is optional or has a default, so stored records still fit. Versions and migrations come with the first change that breaks stored records, not before: records is not at 1.0 yet.
- **Nothing is overwritten or removed for good.** Every change to a record is a new revision, and storage keeps the earlier ones; changes to one record run one after another, each `update` getting it as the last left it, so two changes at once can't lose either. Deleting leaves a tombstone. Reading the earlier revisions and tombstones back comes with the screen that needs it. Only removing an extension drops its data.
- **Derived data is disposable.** Wiki pages, records, embeddings and indexes are built from the notes extension's append-only log, so any of them can be rebuilt. A buggy extension can corrupt a view, never what you said.

## UI for extensions

The draft screens are on the [Personal Agent UI canvas](https://claude.ai/artifact/DgYwb36EJbxiBHgB5TFbu1), on its Extensions page. On mobile every control sits at the bottom; on desktop every action has a key.

| Screen | Device | What it shows |
| --- | --- | --- |
| Extensions list | Mobile | The extensions, previews to try, Vaulter's open suggestion, and "Ask Vaulter for a feature" |
| Vaulter proposes an extension | Mobile | Workouts: the reason, a preview on real notes, what it adds, its hosts and secrets, Try or Not now |
| Page built from panels | Mobile | A place page whose map, visits and question panels each come from a different extension, labelled with their source |
| Extension settings | Desktop | Map: what it adds, its tools and their access, its hosts and secrets, what imports it |
| Map screen | Desktop | An extension's own screen, added to the sidebar by the extension itself |

Three patterns repeat across these screens:

- **Source labels.** Every panel says which extension made it, so it's always clear what turning one off would remove.
- **Proposals look like questions.** A tool call that asks first, and a change Vaulter is unsure of, come with the same Yes and No as any question from Vaulter.
- **What an extension may do is visible.** Its tools' access and its hosts and secrets are shown in plain words.

## Decisions, build order and open questions

**Decisions.**

| Question | Decision |
| --- | --- |
| Extension format | An ES module (`index.ts`) and an `about.ts`; no definition object, no setup function. |
| How extensions reach each other | Imports, by folder (`#extensions/<id>`). One extension per job, and no contracts over them: replacing one is a refactor. |
| Where extensions live, and how they get to a device | In the repo under `extensions/`, built by CI with the kernel into one page. |
| Vaulter-written extensions | Pull requests to `main` with `preview: true`; a device turns a preview on to try it. |
| Turning an extension off | Per device, saved in `localStorage`, and the page reloads; what another extension imports loads anyway. |
| Isolation | None: every extension runs in the page. Review keeps bad code out of `main`. WebAssembly modules if isolation is ever needed. |
| Who is calling | A caller names itself to an extension that keeps something per caller (`recordsFor('wiki')`). |
| Vaulter's access | Each tool declares `read`, `write` or `ask`; the agent applies it, and `ask` is a question whose yes runs the call. |
| What only a person may do | Nothing is enforced: the person answers questions on a screen, and the model can only use tools. |
| Secrets | Sealed into the page by CI with a password, asked once per device; opened into memory at each start, and attached only to requests for declared hosts. Never in the repo. |
| Where extensions keep data | Through `storage`'s records, in its own IndexedDB database. |
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

The extensions so far, each tested with the others (`startApp` in `tests/app.ts`):

| Extension | Exports | Imports | Notes |
| --- | --- | --- | --- |
| `storage` | `recordsFor`, `idbStore` | | Records in its own IndexedDB database, with every revision kept, and search; tested as its importers use it |
| `secrets` | `netFor`, `unlock` | `storage` | Opens the page's sealed secrets, and attaches each only to its declared hosts |
| `notes` | `notes` | `storage` | Append-only; lists by when a note was said |
| `questions` | `questionsFor` | `storage` | Answers reach the asker's topic handler, also after a restart |
| `openai` | `chat` | `secrets` | The Responses API (tool calling for current models needs it), `store: false` with the encrypted reasoning sent back as a turn's `state`. Its model is in `extensions/openai/index.ts`; streaming, live speech and the rest come with what needs them |
| `wiki` | `wiki`, `tools` | `storage`, `notes`, `questions`, `openai` | Person, place, event and topic types; every fact cites its notes; each note is revised into pages by the model, and what it isn't sure of becomes a yes/no question whose answer makes the change |
| `agent` | `agent` | `openai`, `questions`, `#kernel` | Sees every extension's guide and tools, and asks before a tool that asks first |

**A rebuild, not a refactor.** The first draft planned to wrap the existing app's modules as extensions and move features over one at a time. Instead (2026-10-04) Vaulter is rebuilt from scratch on the `pip` branch, with the old app removed there so the two never run side by side.

**Open questions.**

- [ ] Spike: does `POST /v1/realtime/client_secrets` accept browser requests the way the other endpoints do? (It would go through `net.fetch`, so CORS is the only question.) The `openai` extension is tested against a fake API only: a first run with a real key should confirm it, and the model name.
- [ ] The shell: how it lays out views and panels from several extensions, and what it exports for the kernel to hand the page to. The first job of the UI work.
- [ ] Cleaning up data left by extensions deleted from the repo.

**Sources:** [OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
