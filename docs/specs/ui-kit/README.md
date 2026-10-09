# UI kit implementation specs

These are four individual implementation specs for the accepted UI kit architecture work. The
[architecture plan](../../../PLAN-ui-kit-architecture.md) remains the roadmap. Each spec is
self-contained and uses the same problem, solution, stories, decisions and testing format.

| Order | Spec | GitHub issue | Primary test seam |
|---|---|---|---|
| 1 | [Private composition verification](01-composition-verification.md) | [#5](https://github.com/JimLundin/vaulter/issues/5) | The composition-policy check invoked by CI |
| 2 | [Composer interaction](02-composer-interaction.md) | [#6](https://github.com/JimLundin/vaulter/issues/6) | Public Composer, with real Chat and catalogue integration |
| 3 | [Accessible field association](03-accessible-field-association.md) | [#7](https://github.com/JimLundin/vaulter/issues/7) | Public SettingField with supported text and group controls |
| 4 | [Presentation policy](04-presentation-policy.md) | [#8](https://github.com/JimLundin/vaulter/issues/8) | Public overlays in browser and bounded-preview environments |

The user confirmed these testing seams. Private implementation helpers remain private; acceptance
tests assert observable behavior and documented interface requirements. Composer has the strongest
immediate payoff; the verification change comes first to enable useful private helper extraction.

Private composition verification (#5, ticket #9) is implemented on
`spec/5-private-composition-verification`. Composer interaction (#6, ticket #10) is implemented on
`spec/6-composer-interaction`, based on that verification branch. Accessible field association
(#7, tickets #11 and #12) is implemented on `spec/7-accessible-field-association-complete`, based on the
Composer branch. Presentation policy remains pending. Interface mechanics must satisfy the decisions and acceptance behavior in
each spec; these documents supersede the roadmap's earlier unresolved design questions.

Spec #7 completion validation passed: typecheck, lint, 205 Vitest tests, all 168 browser tests
across phone, desktop and touch-desktop, and the product, design-preview and kit builds.
Standards and Spec review findings are resolved, including nested public semantic-control
diagnostics and keyboard acceptance through deferred radio focus.

All four specs are published to the configured GitHub tracker with `ready-for-agent`. Use the
linked issues to track implementation; these local documents retain the published specification.
Tracker operations and triage vocabulary are documented in
[the issue-tracker configuration](../../agents/issue-tracker.md) and
[the label mapping](../../agents/triage-labels.md).

## Implementation tickets

The approved tracer-bullet tickets are native sub-issues of their specs. Blocking relationships
are recorded on GitHub; check their current state before starting work. All tickets carry
`ready-for-agent`.

| Ticket | Parent spec | Blocked by |
|---|---|---|
| [#9 Private composition verification](https://github.com/JimLundin/vaulter/issues/9) | #5 | None |
| [#10 Shared Composer interaction](https://github.com/JimLundin/vaulter/issues/10) | #6 | #9 |
| [#11 Model field association](https://github.com/JimLundin/vaulter/issues/11) | #7 | #9 |
| [#12 Appearance and field semantics](https://github.com/JimLundin/vaulter/issues/12) | #7 | #11 |
| [#13 Dialog and sheet presentation policy](https://github.com/JimLundin/vaulter/issues/13) | #8 | #9 |
| [#14 Settings and navigation drawer policy](https://github.com/JimLundin/vaulter/issues/14) | #8 | #13 |
| [#15 Supporting panels and nested surfaces](https://github.com/JimLundin/vaulter/issues/15) | #8 | #14 |
| [#16 Anchored presentation scope](https://github.com/JimLundin/vaulter/issues/16) | #8 | #13 |
