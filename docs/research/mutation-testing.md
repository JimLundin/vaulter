# Mutation testing in Vaulter

The StrykerJS pilot is implemented. Run `npm run test:mutation` for node traversal;
open `reports/mutation/mutation.html` to inspect results. The separate Mutation
testing workflow runs on demand and uploads HTML and JSON reports.

## Verified pilot

On 2026-10-16, Stryker core and Vitest runner 10.0.0 ran against this lockfile's
Vitest 5.0.3 and TypeScript 7.0.2 on Windows with Node 24.21.0.
The run selected 11 related node behavior tests and generated 21 mutations in
`app/vault/nodes/operations-runtime.ts`: 18 killed, one timeout, two survivors,
and no uncovered mutations. Stryker reported 90.48%; this is evidence for that
file and selected tests, not a project-wide score.

The initial survivors removed the visited-set check or insertion. A follow-up run
on 2026-10-16 with Node 24.22.0 selected 14 tests and detected all 21 mutations:
20 killed, one timeout, zero survivors, and no uncovered mutations (100% for this
file). The added behavior tests cover repeated appearances of shared content,
recursive connection targets, and exact and current versions of the same identity.
Repeated appearances kill both original survivors with an assertion that shared
content occurs once. The recursive fixture bounds snapshot resolution so removing
deduplication fails without hanging a worker. A deliberate identity-only visited
key also failed the exact/current version assertion; the source was restored.

The remaining timeout empties the traversal loop body, leaving its pending root
in place indefinitely. Stryker detects it through its instrumented hit limit.
Timeouts count as detected mutations in Stryker's score; report them separately
because they do not establish a specific behavior assertion.

## Configuration choices

- Shared Vitest and Playwright configurations load without inspecting CLI arguments.
  The npm command wrapper enforces focused local selection.
- The mutation Vitest configuration reuses root React transforms and aliases and
  selects only node-module behavior tests. Stryker keeps related selection enabled
  and collects per-test mutation coverage without a coverage-v8 dependency.
- The pilot disables Stryker's tsconfig rewrite using `tsconfigFile: ""`. Its rewriter
  invokes `typescript.parseConfigFileTextToJson`, which TypeScript 7 no longer exports
  through its default entry. All project tsconfig paths stay within the copied
  sandbox, so rewriting is unnecessary here. Ordinary type checking remains separate.
- Reports and sandboxes are ignored by Git, and Biome excludes the sandbox tree.
- No mutation score gate is enabled. Expand targets and test scope together after
  measuring runtime and reviewing survivors. Next candidates are node validation,
  snapshot history, transaction lifetimes and agent recovery.

## Sources

- [Official mutation testing introduction](https://stryker-mutator.io/docs/)
- [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [Configuration options](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Core package metadata](https://registry.npmjs.org/@stryker-mutator/core/10.0.0)
- [Runner package metadata](https://registry.npmjs.org/@stryker-mutator/vitest-runner/10.0.0)
- [Repository testing guidance](../agents/testing.md)

Compatibility conclusions come from the actual pilot run; future tool upgrades
must rerun it. Mutation results alone do not establish browser or real-provider behavior.
