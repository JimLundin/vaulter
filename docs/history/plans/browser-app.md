# Plan: decouple the viewer from the vault

Status: proposed 2026-10-03; the architecture it led to is in `ARCHITECTURE.md`. Replaces the encrypted single-page snapshot (§14 of `meta/conventions.md`).

## Goal

A public static app (Vite + Preact) that holds no vault data. Unlocking it with a password decrypts a
small secrets blob (GitHub token, OpenAI key), and the app then reads **and writes** `my-vault` live
through the GitHub API. An in-browser agent built on the Vercel AI SDK files Captures from the app.

```
vault-pages (public)                     my-vault (private)
├─ index.html, assets/*   no vault data
└─ secrets.json           {kdf, salt, iv, ciphertext}
                               │ password → PBKDF2 → AES-GCM key (remembered on the device)
                               ▼
                         { githubToken, openaiKey }
                               │ GitHub API: trees + blobs (read), Git Data API (write)
                               └──────────────────────────► *.md, *.mdx, daily/, captures/, meta/
```

Settled decisions: read/write token · Vite + Preact, **no Astro** (nothing is prerendered any more) · app stays in
`my-vault/site` · password remembered per device · the agent commits on its own.

## Principles

- **Better, not the same.** Astro's output is not a target. Keep what works, drop what only exists for history.

- **One vault model, two sources.** All derivation (backlinks, graph, similar, calendar, places, schema
  check) is pure code over `{path, text}[]`. Node feeds it from disk (check, audit, CI); the browser feeds
  it from GitHub, with the agent's staged edits layered on top.
- **The check stays the gate**, now in two places: in the browser before every commit, and in CI on push.
- **No eval.** The page holds a write token, and the agent writes notes, so note content must never run
  as code. MDX is limited to whitelisted components with literal props and rendered from the AST
  (see phase 2), never through `evaluate()`. CSP: `script-src 'self'`; `connect-src` api.github.com,
  api.openai.com; `img-src` tile.openstreetmap.org.
- **The agent commits on its own; code gates the commit.** Committing is part of the agent's job and
  doesn't wait for a human. The commit tool refuses unless `checkVault` passes on the result, and it never
  force-pushes. Every agent commit is listed in the app with its diff and a one-click revert (a new commit,
  not a rewrite).

## Phases

### 1. A pure vault model (no user-facing change) — done 2026-10-03

Today `src/lib/notes.ts` reads via `getCollection('notes')` and `[...slug].astro` via `render()`.
`scripts/check.ts` already parses files itself and uses `fs` only to list, read and test that files exist.

- `src/lib/vault.ts`: `loadVault(files)` → `{ notes, byId, backlinks }`, where a note is
  `{ id, ext, body, data }` (the same shape `notes.ts` uses now). It parses frontmatter with `js-yaml`
  and applies the include rules from `content.config.ts` (root, `daily/`, `captures/`, `meta/`, not `README.md`).
- `src/lib/check.ts`: `checkVault(files)` → `{ problems, ok }`, moved out of `scripts/check.ts`;
  existence tests become lookups in the file set.
- `src/lib/sources/fs.ts`: reads the repo root into `{path, text}[]`.
- `notes.ts` / `vault-map.ts` take their data from `loadVault` instead of `getCollection`. `scripts/check.ts`
  and `scripts/audit.ts` become thin wrappers.
- **Done when** `npm run check` gives the same output and `dist/` is byte-identical before and after.

Outcome: `dist/` is byte-identical; the check reports the same problems on a vault copy seeded with
every kind of breakage; the audit lists the same lines (now sorted by note). `vault.ts` and `check.ts`
bundle for the browser. One tightening: link targets must be pages (before, any file on disk passed).
Astro remains only to keep the current viewer publishing until cutover. Left for phase 3: `notes.ts` still
reads through a module-level `vault()` backed by `sources/fs.ts`. The app needs those derivations as pure
functions of a notes array, so the overlay can re-derive on every staged edit.

### 2. MDX as data — done 2026-10-03

- Check rule: an `.mdx` body may contain only `<NoteList>`, `<Timeline>` and `<Chart>` (already
  `COMPONENTS` in `schema.ts`) with string or literal-JSON props. No `import`/`export`, no other
  expressions. The three current `.mdx` notes already comply.
- Renderer: `remark-parse` + `remark-mdx` + `remark-gfm` + `remark-vault-links` → mdast. Props of
  `mdxJsxFlowElement` nodes are read from their estree literals, and the elements are rendered as Preact
  components. Everything else goes through `remark-rehype` (raw HTML dropped) → `hast-util-to-jsx-runtime`.
- Port `Chart`, `Timeline` and `NoteList` from Astro to Preact. Keep the CSS.

Outcome: `src/lib/mdx-rules.ts` (the rule + literal interpreter, in the check), `src/lib/safe-url.ts`
(relative, http(s), mailto and tel only; in the check, the renderer and `Timeline`), `app/markdown.ts`,
`app/components/`. `{/* comments */}` stay allowed (§13). The legacy `[[wikilink]]` fallback is gone; two
captures show one literal `[[…]]` each. Pure note helpers moved to `src/lib/note-fields.ts`. A one-off
comparison against Astro's dist/ matched all 238 notes before the parity test was dropped. Tests: `npm test`.
Not yet: code highlighting (phase 3).
### 3. The app (Vite + Preact), read-only from a local source — done 2026-10-03

- `site/app/`: hash routing that keeps today's routes (`#/janne/`, `#/topic/x/`, `#/calendar/` ...).
- Port the views: note page (content, backlinks, open questions, follow-ups, connections, dates,
  Neighbourhood, Similar), Dashboard + `brief.ts`, topic, calendar, decisions, map, places. `graph-view.ts`
  and `places-view.ts` work as they are; Leaflet becomes an npm import. The map layout and TF-IDF are
  computed in a Web Worker on load (~230 notes) and memoised by tree SHA.
- Shiki and `shape.tmLanguage.json` are lazy-loaded, only when a page has a code block.
- Dev source: a Vite dev-only middleware serves the working tree, so `npm run dev` needs no token.
- **Done when** every view works from the local source; differences from the Astro viewer are fine where they're improvements.

Outcome: `src/lib/derive.ts` (the whole vault from a notes array, lazy and memoised), `app/` (shell, search,
previews, all views), `npm run dev` with live reload from disk. Checked in headless Chromium: every route
renders without console errors, heading anchors scroll, search/keyboard, previews, chart tooltips, map
focus/zoom/filters, Places with tiles and trail, Shiki (incl. Shape) light and dark, phone layout. Main
bundle 313 kB (105 kB gzip); the MDX parser (acorn), Shiki and Leaflet are separate chunks loaded on use.
Improvements over the old viewer: region labels no longer swallow clicks on dots; search shows note titles
as written. All code moved to TypeScript (Node 24 runs the scripts directly).
Not done, moved to phase 4: the Web Worker. Measured on desktop: map layout 329 ms, similar 142 ms, both on
first use (parse 24 ms, backlinks 22 ms). With the phase 4 cache the layout can also be stored per tree SHA.

### 4. Secrets, unlock, and the GitHub read source — done 2026-10-03

- `scripts/seal-secrets.ts`, run by the publish workflow: seals the GitHub token and OpenAI key (repo
  secrets) with the password (`VAULT_PASSWORD`) into `dist/secrets.json`, with PBKDF2-SHA256 (600k
  iterations), the fixed salt in the `VAULT_SALT` variable, and AES-GCM. Nothing secret is committed; the
  ciphertext is public on vault-pages. (Changed 2026-10-03 from sealing locally and committing the file.)
- Unlock: derive the key with WebCrypto, decrypt, and keep the tokens in memory only.
- **Remember:** store the derived AES key as a **non-extractable** `CryptoKey` in IndexedDB together with
  the salt and an expiry (30 days). On load, decrypt `secrets.json` with it; if the salt changed or
  the key has expired, ask for the password. **Re-sealing with a new salt signs out every device.**
- **Browser storage**: one IndexedDB database (`vault`), written through a small typed wrapper (`app/store.ts`).
  Only raw file text is stored, never parsed notes; parsing is milliseconds, so the parser can change
  without migrations.

  ```ts
  // blobs: keyPath 'sha'; immutable, one per file version
  { sha, iv, data }    // AES-GCM(UTF-8 bytes), additionalData = sha
  // snapshot: key 'main'; the last synced state of main
  { id: 'main', commit, tree, etag, fetchedAt, iv, data }      // encrypted JSON { path: sha }
  // overlay: key 'overlay'; only while there are uncommitted edits (phase 5)
  { id: 'overlay', base, version, iv, data }                   // encrypted JSON { path: text | null }
  // keys: the remembered key and the cache key, with an expiry; survives schema upgrades
  ```

  - No secondary indexes: every read is by key or a single `getAll`; search and the rest are in memory.
  - Keyed by SHA, so a tree diff is a SHA comparison, a rename or a revert costs no fetch, and identical
    files share a record. Paths (names of people, illnesses) exist only inside encrypted `data`.
  - The overlay is one record: an atomic write, no paths in keys, and `version` tells the worker what to recompute.
  - The SHA is AES-GCM additional data, so a ciphertext under the wrong key fails to decrypt rather than
    showing the wrong note.
  - **Writing a fetched blob**: decode the base64 → check `SHA-1("blob <len>\0" + bytes)` equals the SHA
    (git's own hash; a corrupt or tampered response never reaches the cache) → encrypt → write. New blobs
    and the new snapshot go in one transaction; GC runs in a second one.
  - **Reading on open**: `snapshot` → decrypt the map → `blobs.getAll()` → decrypt in parallel → apply the
    overlay → `loadNotes`. One transaction, ~240 decryptions.
  - **Versioning**: on a schema change, bump the DB version and clear everything but `keys`; the next sync refills it.
  - **Encrypted at rest**: the cache key is random and non-extractable, created at unlock. Expiry or
    sign-out deletes it, which makes the cache unreadable. This protects the disk and profile, not script
    on the same origin. The origin is shared with `vpscompare`, which is being decommissioned, so that's accepted.
  - `navigator.storage.persist()` on unlock, so Safari's 7-day eviction of script-written storage doesn't drop
    the cache and the key. If it happens anyway, the cost is the password again and one full fetch.
- **Sync** (`app/sync.ts`), on open and when the tab regains focus:
  1. Render immediately from the cached snapshot, which also gives offline reading for free.
  2. `GET /repos/JimLundin/my-vault/git/ref/heads/main` with `If-None-Match`. A `304` doesn't count against
     the rate limit, and most opens stop here.
  3. If `main` moved: `GET /git/trees/{sha}?recursive=1`, compare path→SHA with the snapshot, and fetch the
     missing blobs with `GET /git/blobs/{sha}` (a few at a time). Then swap in the snapshot in one transaction.
  4. GC: delete blobs that neither the snapshot nor the overlay references, so the store holds one copy of the vault (~1 MB today).
  - After the app's own commit, the snapshot is updated from what it just wrote, with no refetch.
  - A `BroadcastChannel` tells other open tabs when a sync or commit lands; they reload from the new snapshot.
- **In memory**: the snapshot plus the overlay gives `{ path, text }[]`, which goes to `loadNotes`, then the
  derivations. The heavy ones (map layout, similar notes) run in a Web Worker, memoized by tree SHA plus an
  overlay version.
- Token: fine-grained PAT, repository `my-vault` only, Contents read/write and Metadata read, with an expiry.
  If the GitHub plan allows rulesets on private repos, block force-push and deletion on `main` so a leaked
  token can at worst add commits, which are revertible.
- **Milestone: the read-only viewer can replace StatiCrypt here** (cutover A, phase 7).

Outcome: `src/lib/sealed.ts` + `scripts/seal-secrets.ts` (sealed in CI from the repo secrets, see above),
`app/unlock.ts`, `app/store.ts`, `app/github.ts`, `app/sync.ts`, `app/source.ts` (dev: the working tree;
built: GitHub through the cache), `app/Unlock.tsx`, sync state and sign-out in the top bar. The map layout
and similar notes are computed in `app/heavy.worker.ts` and cached encrypted per tree SHA (store `derived`),
so a reload of an unchanged vault shows them at once. A service worker (`app/sw.ts`) keeps the app shell
offline; it handles only the page, `assets/` and `secrets.json`. CSP on the built page: script only from the
app, network only to GitHub, OpenAI and the tiles.
Tested: unit tests against fake IndexedDB and a fake GitHub (one 304 when unchanged, only changed blobs
fetched, GC, tampered blobs refused, nothing readable without the key, expiry and re-sealing sign out); and
the production build end to end in Chromium against a mock GitHub API serving this repo's git objects:
first unlock 1.8 s (238 blobs, PBKDF2 600k), reload 0.2 s with one 304 and no password, offline reload
including MDX notes, a second tab without the password, sign-out empties every store, no CSP violations.
Not tested against api.github.com itself: that needs the real token (cutover A).

### 5. The write path — done 2026-10-03

- Working set: an overlay `{path → text | null}` on top of the fetched files, persisted in IndexedDB so
  staged work survives a reload. `loadVault(base ⊕ overlay)` re-derives everything, so previews, backlinks
  and the check reflect staged edits.
- `commitOverlay(message)`: the single write function, shared by the agent's commit tool and the manual editor.
  It refuses while `checkVault` fails.
- History UI: recent commits made from the app, each with its diff and a Revert button (reverting creates a new commit).
- Commit (Git Data API, atomic across files): create blobs → `POST /git/trees` with `base_tree` →
  `POST /git/commits` with the parent → `PATCH /git/refs/heads/main` with `force: false`.
  If the update is rejected as not a fast-forward, re-fetch the tree. If none of the staged paths changed
  upstream, rebase the overlay, re-run the check and retry; otherwise show the conflict.
- Commit messages follow the existing `vaulter:` / `vault:` style; the trailer names the app/agent.
- Manual editing (a textarea per note) comes free here and is a good way to test the write path before the agent exists.

Outcome: `app/write.ts` (overlay, `commitOverlay`, `revertCommit`, `history`), the `Writer` in `app/source.ts`
(what the editor uses and the agent will), and the views Edit (`#/edit/<path>/`), Changes (diffs, the check,
commit) and History (patches, revert). The check gate refuses only problems the commit adds, so an old problem
elsewhere doesn't block a Capture. Each staged path remembers its sha on main, so a change made there since
staging is a conflict, not an overwrite. Every app commit carries `Committed-From: vault app`.
Tested: unit tests over an in-memory GitHub with git semantics (one commit for many files, refused on a new
problem, rebuilt when main moved elsewhere, conflict on the same file, stale staging, revert incl. a new file,
revert refused when the file changed since); and in Chromium against a mock GitHub API doing git plumbing on a
throwaway bare clone: edit, stage, reload, commit (fast-forward, trailer), history patch, revert to the exact
original, a broken link disabling Commit, a new-note template.

### 6. The agent (Vercel AI SDK, in the browser) — done 2026-10-03

- `ai` + `@ai-sdk/openai`, with `createOpenAI({ apiKey })` from the unlocked secrets, and `streamText` with tools
  and a step limit. Pin the SDK version at implementation time and check its browser and tool APIs then.
- System prompt: `meta/conventions.md`, fetched live from the vault, plus the capture procedure. Move
  the procedure now in the Claude `vault` skill into `meta/` so both agents follow the same text.
- Tools, all over the overlay vault: `listNotes(filter)`, `readNote(id)`, `search(query)`
  (title/alias/TF-IDF), `backlinks(id)`, `writeFile(path, text)`, `deleteFile(path)`, `check()`,
  `commit(message)`. `commit` calls `commitOverlay`, so a failing check comes back to the agent as the
  tool result, for it to fix and retry. Following the conventions, one Capture is one commit.
- Chat UI: streaming transcript, tool calls inline, and the commits the agent made, with links to their diffs and Revert.
- Later: voice input via the OpenAI transcription endpoint (the STT quality problem in `Vaulter.md`).
- Set a monthly spend limit on a dedicated OpenAI project for this key.

Outcome: `app/agent.ts` (tools: search, listNotes, readFile, backlinks, writeFile, deleteFile, check,
commit; instructions; `runAgent` over AI SDK 7 `streamText` with `isStepCount(40)`) and the view
`#/agent/` (`app/views/Agent.tsx`): streaming text, each tool call on a line, commits linked to History,
Stop, and the model as a setting (default `gpt-6-astra`, kept in localStorage). The SDK and the provider load
with the view (219 kB chunk). The capture procedure was already in `meta/conventions.md` §16 (the Claude
skill is plumbing only), so the agent's instructions are the skill's plumbing rewritten for these tools,
plus the conventions in full, which win. The conversation lives in memory for the session.
Tested: with AI SDK's mock model, the real tool loop over the fake GitHub (a commit refused by the check,
fixed, committed once; paths outside the vault refused; the conventions in the prompt); and in Chromium
against a scripted mock of OpenAI's streaming Responses API plus the git-backed mock GitHub: search, stage,
check, one `vaulter:` commit with the trailer, the streamed reply, the key and conventions sent, no CSP
violations, the conversation kept across navigation. Not tested against api.openai.com itself.

### 7. CI, cutover, docs

- `publish.yml` runs only on `paths: site/**`: `npm ci && npm run build` → push `site/dist/`
  (including `secrets.json`) to `vault-pages` as today (orphan commit, deploy key, `.nojekyll`, robots).
- New `check.yml` runs on every push: `npm run check`, the backstop for commits from any agent.
- Cutover A (after phase 4): the read-only app replaces StatiCrypt. Delete Astro entirely (`astro.config.ts`,
  `content.config.ts`, `src/pages/`, the `.astro` components and layout, the `astro`/`@astrojs/*` dependencies),
  plus the encrypt step, the `VAULT_PASSWORD` secret, `build-artifact.ts` and `artifact-shell.html`.
  **Code done 2026-10-03**: Astro is gone (config, collection, pages, components, layout, packer, `notes.ts`
  and the Astro-only parts of `brief.ts`, `graph-view.ts`, `places-view.ts`, and the dependencies);
  `check.yml` and the new `publish.yml` are in; the docs are updated. Left, by hand: the secrets and the
  salt variable (site/README.md, Publishing), then push. `VAULT_PASSWORD` stays: it is now the app's
  password. Until the secrets are set, publish fails and the old page stays up.
- Docs: `meta/conventions.md` §14 ("pushing publishes" stops being true; the check gate moves into the app),
  `site/README.md`, `Knowledge Vault.md` (history), the root `README.md`.

## Accepted trade-offs

- Cracking the password now gets someone a write token, not a snapshot. Mitigations: PBKDF2 600k, a strong password,
  a scoped expiring PAT, branch rules, and git history for reverts.
- The page no longer reads with script blocked.
- The OpenAI key lives in the browser. That's fine for one user with a spend limit; a proxy would need its own auth.

## Open questions (later)

- Should the agent model be OpenAI only, or should the provider be switchable (the AI SDK makes that cheap)?
