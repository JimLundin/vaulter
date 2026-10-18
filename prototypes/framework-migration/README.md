# Throwaway browser framework migration prototypes

Question: which browser-only framework gives Vaulter less application plumbing and better locality when rebuilding presentation? These are equivalent migration slices, not the new design kit and not a complete application migration.

Run from this worktree with `npm run prototype:frameworks`. The launcher installs each pinned lockfile and starts SvelteKit at http://localhost:5181/wiki/ and SolidStart at http://localhost:5182/wiki/. Root dependencies must already be installed with `npm ci`.

Both share the real typed EAV Store, native Wiki reading, Tasks operations and Conversation/Agent execution. Fixtures and a scripted model are fictional; storage is memory-only and reset on reload. There are no credentials or remote writes. This branch leaves production and its preview untouched.

## Try the same workflow

1. Write a Conversation draft and navigate between Wiki and Tasks: the draft survives.
2. Create a Task and change status: the projection updates after an accepted Transaction.
3. Search Wiki while on Tasks: the shared reader stays active.
4. Create a Wiki page: its runtime Record ID resolves without rebuilding. Try Back/Forward.
5. Send a Conversation message and navigate immediately: the Agent response completes and modelCalls stays 1.
6. Hide/show Conversation: its draft survives.
7. Reload a runtime Record URL: routing succeeds; the Record is unavailable because the fictional Vault resets, as documented.

The layout owns the Vault and Conversation above route selection. Route files own page presentation; shared fixture/composition behavior is in `shared/vault.ts`. No router loader becomes a second Vault authority.

## Verification and measurements

Both static outputs passed this browser sequence in Chromium with no page errors. Both native compiler checks and builds passed. The existing Tasks and Conversation focused behavior selection passed 15 tests. Root lint and typechecking were also run; see the delivery/CI result for complete routine verification.

Build separately: `npm --prefix prototypes/framework-migration/sveltekit run build` or the corresponding `solidstart` command. Check separately with `run check`.

SvelteKit uses its static adapter and SSR disabled. SolidStart 2.0.6 emits client/server build artifacts even with SSR disabled; `scripts/export-static.mjs` evaluates its document at build time and writes `dist/client/index.html`. Publish only `build/` for SvelteKit or `dist/client/` for SolidStart. `serve-static.mjs <directory> <port>` serves files with an SPA fallback for the local verification. GitHub Pages fallback/base paths, strict production CSP and offline service-worker behavior have not been migrated or verified.

`measurements.json` captures this slice. SvelteKit has 8 native source files / 6,980 bytes; SolidStart has 9 / 9,047 bytes. These are byte counts, not proof of maintainability. Solid's total static JavaScript is smaller in this slice (~155 KB gzip versus ~171 KB), including the shared Store, model SDK and scripted model; this is not initial-route transfer, a production bundle comparison, or an estimate of the full migration. Lockfile package counts include optional packages and differ from installed packages.

## Findings

- Both frameworks retain the useful depth of the existing Vault and execution modules. Neither removes live subscription or asynchronous race handling.
- SvelteKit's raw reactive snapshots are required for EAV Record identity: deep `$state` proxies caused a real Task write rejection; `$state.raw` fixes it. Solid signals naturally retain those values. This is a migration constraint to keep, not a reason to weaken Store validation.
- Calendar's public behavior entry exports routes and React presentation types. A Tasks import therefore pulled old React navigation and the kit into both initial builds. Both configs now use an explicitly marked prototype-only alias from Calendar's entry to its existing pure time implementation for Tasks' `parseTime` dependency. Production should split portable behavior from route/presentation entries, preserving owner interfaces, rather than retain the alias.
- Both prototype native checkers understand remaining React source types. Solid files use a per-file Solid JSX directive, because the reused graph still contains React types. This is transitional scaffolding, not a recommendation for a mixed production renderer.
- The new design kit is represented only by equivalent plain semantic controls and shared CSS. Focus/portal/mobile interactions, citations, Graph, Questions, actual provider transports, credential lifecycle, persistence recovery matrices and the complete kit are outside this slice.

## Provisional verdict

SvelteKit remains the leading choice for reducing handwritten presentation and setup: the equivalent native slice is smaller and the static adapter needs less glue. SolidStart is credible and has a smaller generated JavaScript total here; signals also fit Record identity naturally. The difference is not large enough to justify a full migration solely on these measurements. Next validate the new kit's hardest interaction and real persistence/session lifecycle in the preferred framework. Do not promote throwaway code directly to production.
