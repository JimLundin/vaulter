# Testing

Use the smallest test scope that exercises the change while editing. Broaden verification before
delivery. Run commands from the worktree containing the change.

## Edit loop

- Run behavior tests for the owning module with `npm run test:fast -- app/workflows/chat`, or
  keep them running with `npm run test:watch -- app/workflows/chat`.
- To select behavior tests through imports, use
  `npm exec vitest -- related app/workflows/chat/node-conversation.ts --run --project=behavior`.
  Source-inspection checks read files directly and need explicit selection.
- For browser behavior, select the relevant spec and project, for example
  `npm run test:ui -- tools/browser/composer.spec.ts --project=desktop`.
  `--grep 'part of the test name'` narrows a spec further.
- Run `test:architecture` when changing imports, exports, module ownership, public kit components,
  shared compositions, or the policy checkers. Keep compiler fixture tests in that suite.

## Test placement and device coverage

Test state transitions, persistence, recovery and replay prevention through the owning module's
interface, using its memory backend or fake transport. Keep browser checks for user-visible wiring,
layout, native input, focus, scrolling, portals and pointer behavior. Test shared presentation
thoroughly in the kit; workflow checks establish that its callers use it correctly.

Every browser scenario runs on desktop. Add Playwright details `{ tag: '@phone' }` for behavior
depending on mobile emulation, compact startup, or phone focus and dismissal. Add `@touch` for
coarse-pointer density, hover differences or touch gestures on a wide screen. Both tags can be
supplied as an array. A paired specimen or explicit viewport loop already covers its layouts;
choose additional device tags only when emulation or pointer behavior adds a distinct assertion.
Viewport resizing does not emulate mobile or change pointer capabilities.

Use `npm run test:ui:matrix` to run every scenario on all three profiles when auditing device
coverage or changing shared responsive and input mechanics. To run an untagged scenario on a
particular device, select it through this command with `--project` and its spec or `--grep`.

## Delivery

Run lint and type checking, both Vitest projects (`npm test`), the routine browser suite, and
production acceptance before delivering test infrastructure changes. For other edits, choose
the affected suites; shared kit or Product changes require the broader browser suite. Repeat
passed checks when subsequent edits affect their scope or a failure leaves an unresolved concern.
`npm run test:all` runs the complete routine verification once.

CI runs all routine checks, with four browser shards. The aggregate `test` job requires every
job and shard to pass before production deployment. Browser jobs retain blob reports and failure
traces for seven days; production failures retain an HTML report and traces. A missing device
tag is a coverage decision to review, not a reason to treat a focused local pass as full coverage.

## Worktree isolation

Use separate ports for simultaneous browser runs. `VAULTER_UI_PORT` selects the design server;
`VAULTER_PRODUCTION_PORT` selects the production preview. Use a server from the same worktree
and fixture configuration when reusing it locally. `VAULTER_BROWSER` can select an installed
Chromium executable. CI always starts a fresh server.
