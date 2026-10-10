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
Composer branch. The Base UI migration (#18, including #17) and initial presentation policy
implementation are on `spec/18-base-ui-and-presentation-policy`. Presentation policy completion is on
`spec/8-presentation-policy-complete`; see its [acceptance record](04-presentation-policy-acceptance.md),
the scope update in the policy spec and the [Search library decision](../../adr/0001-base-ui-search.md).
Interface mechanics must satisfy the decisions and acceptance behavior in
each spec; these documents supersede the roadmap's earlier unresolved design questions.

Final field-association fixes cover nested public semantic-control diagnostics and keyboard
acceptance through deferred radio focus.

The completed specs, final field-association fixes and Base UI migration are integrated on
`structure` at merge commit `ec3fac6`. The `prototype/wiki-provenance` branch is also included:
its selected design shows claim evidence beside the page on desktop and in the shared Drawer
on mobile. Open `#/prototype/provenance/` in the design preview to review the fictional example.

Integration validation passed: typecheck, lint, all 207 Vitest tests, all 246 browser cases across
phone, desktop and touch-desktop, and both product and design builds. A separate phone/desktop
wiki smoke check passed page rendering, claim selection, evidence dismissal and no page errors.
Existing lint/build warnings remain. The user accepted the physical iOS Safari retest after the
preview scrolling and viewport fixes at `1037d86`, completing #17's remaining keyboard acceptance.
Touch drawer dismissal has automated browser coverage. The completed input-button comparison
has been removed; the app and preview use the selected shared primary style.

The specs are published to the configured GitHub tracker. Use the
linked issues to track implementation; these local documents retain the published specification.
Tracker operations and triage vocabulary are documented in
[the issue-tracker configuration](../../agents/issue-tracker.md) and
[the label mapping](../../agents/triage-labels.md).

## Implementation tickets

The approved tracer-bullet tickets are native sub-issues of their specs. Blocking relationships
are recorded on GitHub; check their current state before starting work. The policy tickets were
held for the Base UI migration; their final scope targets that library.

| Ticket | Parent spec | Blocked by |
|---|---|---|
| [#9 Private composition verification](https://github.com/JimLundin/vaulter/issues/9) | #5 | None |
| [#10 Shared Composer interaction](https://github.com/JimLundin/vaulter/issues/10) | #6 | #9 |
| [#11 Model field association](https://github.com/JimLundin/vaulter/issues/11) | #7 | #9 |
| [#12 Appearance and field semantics](https://github.com/JimLundin/vaulter/issues/12) | #7 | #11 |
| [#13 Dialog and overlay presentation policy](https://github.com/JimLundin/vaulter/issues/13) | #8 | #9 |
| [#14 Settings and navigation drawer policy](https://github.com/JimLundin/vaulter/issues/14) | #8 | #13 |
| [#15 Supporting panels and nested surfaces](https://github.com/JimLundin/vaulter/issues/15) | #8 | #14 |
| [#16 Anchored presentation scope](https://github.com/JimLundin/vaulter/issues/16) | #8 | #13 |

## UI-kit cleanup (#20)

Reusable preview comparison (#23) is implemented before retiring provenance B/C. See the
[#23 consumer and decision record](20-cleanup/23.md). DesignComparison accepts named alternatives
inside the relevant preview; each example owns its selection independently of device choice.
The paired preview sample compares retained page/input presentation. Selected provenance A now
renders directly without rejected B/C choices; future design sessions can supply alternatives to
DesignComparison. See the [#26 consumer and decision record](20-cleanup/26.md).

Cleanup implementation is integrated on `spec/20-ui-kit-cleanup` from review base `fe941c2`.
For current ticket evidence, retained/provisional scope and final check results, read the
[cleanup acceptance record](20-cleanup/README.md). The
[maintainer inventory reconciliation](20-reduction-inventory.md#implementation-reconciliation)
preserves the original decisions and maps every approved removal to its consumer/dependency record.
