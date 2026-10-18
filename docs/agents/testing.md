# Testing

Full-suite verification runs only in GitHub Actions. Use focused tests locally, then commit and
push the feature branch for complete verification. Run local commands from the worktree containing
the change.

## Edit loop

- Run behavior tests for the owning module with `npm run test:fast -- app/conversation`, or
  keep them running with `npm run test:watch -- app/conversation`.
- To select behavior tests through imports, use
  `npm exec vitest -- related app/modules/conversation/conversation.ts --run --project=behavior`.
  Source-inspection checks read files directly and need explicit selection.
- For browser behavior, select the relevant test file and project, for example
  `npm run test:ui -- app/shared/ui/kit/composer.browser.test.ts --project=desktop`.
  `--grep 'part of the test name'` narrows a file further.
- For imports and module ownership, run `npm run test:architecture -- tools/architecture/layout.test.ts`.
  For shared compositions or public kit components, select `tools/architecture/composition.test.ts` or
  `tools/architecture/catalogue.test.ts`. Keep compiler fixture tests in that suite.

Test commands require a module path, file, test-name filter, or changed-file selection locally.
Selecting only a project, device or shard does not focus the behavior under test. Unscoped
`npm test`, `test:fast`, `test:watch`, `test:architecture`, `test:ui`, `test:ui:matrix` and
`test:production` exit before tests or servers start. `test:all` exits before any checks start.
The npm command wrappers enforce this policy. Shared runner configurations accept CLI and
programmatic callers without inspecting process arguments. Direct Vitest and Playwright commands
must still select focused tests locally.
Listing tests and command help remain available. Let GitHub Actions supply its CI environment;
use focused selection locally rather than setting CI variables to bypass the guard.

## Mutation testing

`npm run test:mutation` runs focused EAV engine behavior with Stryker. Its configuration reuses the
application transforms and aliases. HTML and JSON reports are written to `reports/mutation/`.
Review survivors for observable failures before adding assertions or suppressing equivalent mutations.
The on-demand Mutation testing workflow retains reports for seven days. Expand mutation targets and
the corresponding focused selection together in `tools/testing/`; ordinary type checking verifies
the application outside mutation runs.

## Test placement and device coverage

Keep tests beside the source or within the module they exercise. Put scenarios spanning multiple
modules in `app/application/`. Name Vitest tests `*.test.ts` or `*.test.tsx`, preview Playwright
tests `*.browser.test.ts`, and production Playwright tests `*.production.browser.test.ts`.
Vitest excludes browser tests; the two Playwright configurations select their respective suffixes.
Compile-only API contracts use `*.type-test.ts`; `typecheck` verifies them without scheduling
runtime tests. Keep these beside the public API they constrain.
Shared browser drivers use `*.browser.test-support.ts` beside their kit components. Keep runner
utilities in `tools/testing/` and architecture checks in `tools/architecture/`.

Test state transitions, persistence, recovery and replay prevention through the owning module's
interface, using its memory backend or fake transport. Keep browser checks for user-visible wiring,
layout, native input, focus, scrolling, portals and pointer behavior. Test shared presentation
thoroughly in the kit; workflow checks establish that its callers use it correctly.

Before adding or retaining a test, identify the user-visible failure it catches and the assertion
that distinguishes correct behavior. Put shared contracts at their owner and keep one browser
integration check per caller seam; exercise recovery matrices through the backend interface.
Remove checks for retired designs and assertions that merely repeat implementation details.
For an uncertain assertion, introduce a deliberate source fault temporarily, verify that the
test fails for that fault, restore the source, and verify the original behavior passes.

Preview tests use scripted models and memory persistence. Production browser tests use the built
app with fake remote transports. These establish application behavior under controlled responses;
provider availability and real service compatibility need separate evidence. Chromium phone
emulation and synthetic composition events establish only those simulated conditions.

Every browser scenario runs on desktop. Add Playwright details `{ tag: '@phone' }` for behavior
depending on mobile emulation, compact startup, or phone focus and dismissal. Add `@touch` for
coarse-pointer density, hover differences or touch gestures on a wide screen. Both tags can be
supplied as an array. A paired specimen or explicit viewport loop already covers its layouts;
choose additional device tags only when emulation or pointer behavior adds a distinct assertion.
Viewport resizing does not emulate mobile or change pointer capabilities.

Keep browser checks efficient: load each specimen once before looping over viewport sizes, and
advance scripted demo timers with Playwright's clock when the elapsed time is not being tested.
CI traces the first retry instead of recording every successful test. Each browser shard writes
elapsed time, combined test time and its ten slowest attempts to the job summary. CI bundles the
existing specimen URLs once per shard and installs only Chromium's headless shell. Local checks
use the development server; set `VAULTER_UI_BUILD=1` to verify a focused selection against the
bundled fixtures. The test build uses fictional provider settings and is never published.

Use `npm run test:ui:matrix -- app/shared/ui/kit/composer.browser.test.ts --project=phone` to debug an untagged
scenario on a particular device. Full device audits run in CI through the workflow's
`full_ui_matrix` input; use them when changing shared responsive and input mechanics.

## Delivery

1. Run focused tests for the change, plus lint and type checking as appropriate.
2. Commit and push the feature branch to trigger full verification. Push changes during iteration
   when broader feedback is useful; local full-suite completion is never a prerequisite.
3. Inspect the Deploy workflow for the exact pushed commit. A successful aggregate `test` job
   establishes full routine verification. If checks fail, use their reports to reproduce the
   failure with a focused local command, fix it, and push again.

Report the commit and CI result at delivery. If CI is pending, unavailable or failing, state that
status explicitly; a focused local pass establishes only its selected scope. `test:all` remains
available inside GitHub Actions for complete routine verification.

CI runs all routine checks, with four browser shards using up to four workers within the runner's
available CPU capacity. Local browser checks default to two workers. The aggregate `test` job
requires every job and shard to pass before production deployment. Browser jobs retain blob reports and failure
traces for seven days; production failures retain an HTML report and traces. A missing device
tag is a coverage decision to review, not a reason to treat a focused local pass as full coverage.

## Worktree isolation

Use separate ports for simultaneous browser runs. `VAULTER_UI_PORT` selects the design server;
`VAULTER_PRODUCTION_PORT` selects the production preview. Use a server from the same worktree
and fixture configuration when reusing it locally. `VAULTER_BROWSER` can select an installed
Chromium executable. CI always starts a fresh server.
