# Let composition verification follow private modules

## Problem Statement

As the UI kit grows, maintainers need to organize its implementation without changing what product
callers must learn. The current composition check accepts helpers only when they are declared in
the checked source file. Moving a valid helper into a private module can fail verification or force
a new public export and catalogue example.

That restriction couples internal organization to the public interface. Removing the whole check
would lose useful protection against ad hoc presentation. We need private implementation freedom
with the existing composition rules still enforced.

## Solution

Check a composition and its reachable private helpers as one implementation. Accept private
helpers that compose approved public building blocks, reject presentation violations wherever they
occur, and keep the catalogue's building-block documentation accurate. Private extraction should
leave the public interface unchanged.

## User Stories

1. As a kit maintainer, I want to extract a private helper, so that related behavior has better locality.
2. As a kit maintainer, I want equivalent inline and extracted helpers to pass the same check, so that file arrangement does not become a public obligation.
3. As a product developer, I want internal helpers to stay private, so that the public kit remains navigable.
4. As a kit maintainer, I want imported private helpers checked transitively, so that extraction cannot hide a presentation violation.
5. As a kit maintainer, I want aliased imports resolved correctly, so that renaming an import cannot bypass verification.
6. As a kit maintainer, I want re-exported private helpers checked, so that moving an export does not change the policy.
7. As a kit maintainer, I want nested private helpers checked, so that violations several calls away remain visible.
8. As a kit maintainer, I want valid private context providers accepted, so that shared composition state can remain internal.
9. As a kit maintainer, I want raw DOM rejected in checked private compositions, so that presentation stays in approved building blocks.
10. As a kit maintainer, I want styling props and styling spreads rejected, so that private extraction cannot introduce custom styling.
11. As a kit maintainer, I want intrinsic element factories rejected, so that changing JSX syntax cannot bypass the rule.
12. As a kit maintainer, I want unapproved interaction controls rejected, so that compositions retain the kit's interaction choices.
13. As a kit maintainer, I want approved primitives to retain their DOM and styling, so that the check respects their implementation responsibilities.
14. As a kit maintainer, I want unresolved presentation targets reported, so that an incomplete check never silently passes.
15. As a kit maintainer, I want cyclic references handled, so that verification terminates reliably.
16. As a kit maintainer, I want repeated references deduplicated, so that diagnostics stay readable.
17. As a kit maintainer, I want diagnostics to identify the offending source and location, so that I can fix violations directly.
18. As a catalogue reader, I want Built from links to include building blocks used through private helpers, so that the examples explain their actual composition.
19. As a product developer, I want private kit imports and missing public examples still rejected, so that stronger internal checking preserves existing protections.
20. As a kit maintainer, I want tests to exercise the policy check itself, so that private checker refactors do not rewrite the test suite.

## Implementation Decisions

- Deepen the existing composition verification module. Its highest testable interface accepts a
  project and the configured composition roots, and reports violations and the approved building
  blocks each root uses. CI and temporary-project tests invoke that same check.
- Keep this Node-only verification interface private to project tooling. It adds no application
  export, runtime registration or kit dependency for product callers.
- Retain the currently configured composition roots. This work changes traversal within their
  implementations; it does not make every kit module a checked composition.
- Preserve existing whole-root checks. Follow statically resolved private presentation helpers
  and context providers reached from those roots; a helper must satisfy the same composition rules.
- Use compiler-resolved symbols and declarations for named imports, aliases and re-exports. Keep a
  visited set so cycles terminate and shared references do not duplicate diagnostics.
- Approved public building blocks are stopping points. Their implementations own permitted DOM,
  styling and library mechanics. Recognition must continue to handle the unstyled adapter rather
  than accidentally descending into primitive implementation.
- Do not accept arbitrary external presentation imports, unresolved presentation targets, raw DOM,
  custom styling, styling spreads or intrinsic factories as private helpers. Retain the existing
  rule for local state-only context providers and extend it to valid resolved private declarations.
- Derived building-block usage includes approved public blocks reached through private helpers.
  Keep the declared composition metadata checked against that usage, and keep catalogue links
  accurate. No new catalogue registration is required for a private helper.
- Diagnostics include the offending source and location. Tests may compare policy reasons and
  relative fixture locations; they must not depend on a traversal order with no documented meaning.
- Preserve the existing public-kit import policy, workflow independence and public-example checks.
- The deletion test supports removing the helper-location obligation, while retaining the checks
  whose deletion would redistribute presentation policing. Depth provides leverage across checked
  compositions and locality for private implementation changes.
- Extract an actual private helper only if it benefits the implementation. A temporary fixture is
  sufficient to establish the new behavior; this spec does not require production file splitting.

## Testing Decisions

- The user confirmed the CI composition-policy check as the test seam. Test accepted or rejected
  source projects and observable diagnostics through that interface, not symbol maps or traversal
  helpers.
- Follow the existing dependency-policy tests that create temporary TypeScript projects. Provide
  paired fixtures with equivalent inline and private-helper implementations and require equivalent
  acceptance and building-block usage.
- Cover valid direct, nested, aliased and re-exported helpers; valid private context providers;
  cycles; repeated references; and multiple roots sharing a helper.
- Cover raw DOM, direct and spread styling, intrinsic factories, unapproved library controls and
  unresolved presentation targets inside reached private helpers. Assert the offending location
  and policy reason.
- Verify that approved public primitives remain stopping points, including wrapped exports. Their
  permitted DOM or styling must not be reported as a composition violation.
- Retain public import, workflow-independence and catalogue-export tests. Retain the browser check
  that follows Built from links, and update expected metadata only for actual composition changes.
- Run typecheck, the full Vitest suite, lint and the browser suite on phone, desktop and
  touch-desktop. Both product and design builds must remain valid.
- Completion requires private extraction to pass without growing the public interface, all listed
  violations to fail through the same seam, and accurate catalogue metadata.

## Out of Scope

Checking every kit module, redesigning the public kit, weakening primitive restrictions, supporting
arbitrary runtime-generated presentation graphs, replacing the compiler, and reorganizing unrelated
source files. Composer behavior, field association and presentation policy are separate specs.

## Further Notes

This is first in the migration sequence because it enables the later specs to use internal seams.
It has no dependency on them. Internal helpers and a generic adapter protocol are different choices;
this work needs the former only where extraction actually helps.

At reviewed commit `61769fa`, the selected existing composition, dependency and catalogue checks
passed. They do not yet establish the private-helper behavior specified here. No relevant ADR or
project glossary was present; terminology follows the kit's existing names.
