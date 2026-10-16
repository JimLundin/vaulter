# Mutation testing in Vaulter

The StrykerJS pilot is implemented. Run `npm run test:mutation` for node traversal and ingress validation;
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

## Ingress validation expansion

On 2026-10-16, the target expanded to `validation.ts` and `json-schema.ts` alongside
traversal. The initial run generated 86 mutations: 51 killed, one timeout,
29 survivors and five uncovered mutations (60.47%). Direct tests at the node
module now exercise imported envelopes, complete version groups, offset timestamps,
future operation kinds, sequence bounds, request digest boundaries, identities,
non-JSON prototypes, payloads and every own entry in read expectations.

The final run selected 42 related tests and completed in 16 seconds on Windows
with Node 24.22.0: 81 killed, one timeout, four survivors and no uncovered
mutations (95.35%). The focused node-module check also passed all 47 tests.

| Target | Killed | Timeout | Survived |
| --- | ---: | ---: | ---: |
| Traversal | 20 | 1 | 0 |
| Ingress validation | 34 | 0 | 1 |
| JSON schemas | 27 | 0 | 3 |

Three survivors remove validation diagnostic text; the tests assert acceptance,
rejection and retained values without fixing that wording as a contract. The
fourth empties `jsonObject`'s catch block: returning `undefined` instead of `false`
still causes Zod's custom validator to reject. These remain unsuppressed in the
report; no score gate was added.

Stryker's Vitest runner 10.0.0 initially reported an empty transaction schema as
survived when Zod's `omit` threw during collection and no tests were collected.
A deliberate source fault confirmed that ordinary Vitest fails the suite.
The ingress tests now import validation inside their test bodies, so construction
errors fail a collected test and Stryker detects that mutation. A separate deliberate
fault removing ingress canonical validation also failed the prototype-rejection
assertion. All temporary source faults were restored.

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
  measuring runtime and reviewing survivors. Next candidates are snapshot history,
  transaction lifetimes and agent recovery.

## Sources

- [Official mutation testing introduction](https://stryker-mutator.io/docs/)
- [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [Configuration options](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Core package metadata](https://registry.npmjs.org/@stryker-mutator/core/10.0.0)
- [Runner package metadata](https://registry.npmjs.org/@stryker-mutator/vitest-runner/10.0.0)
- [Repository testing guidance](../agents/testing.md)

Compatibility conclusions come from the actual pilot run; future tool upgrades
must rerun it. Mutation results alone do not establish browser or real-provider behavior.
