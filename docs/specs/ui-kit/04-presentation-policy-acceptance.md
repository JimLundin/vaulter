# Presentation policy acceptance (#8)

Integration branch: `spec/8-presentation-policy-complete`, based on the existing Base UI migration
and initial policy implementation at `82469f7`. The completed spec retains public browser and
bounded-preview overlay seams.

| Ticket | Final behavior | Evidence |
|---|---|---|
| #13 | Dialog, Search and Overlay use shared scope policy; focus return skips disabled and invisible openers. | `tools/browser/presentation-policy.spec.ts`, framework Search focus history and resize checks, real preview tests. |
| #14 | Settings/navigation Drawer retains modal ownership when overlapping surfaces close in either order and cleans up when samples unmount. | Public nested/overlapping wheel-scroll and focus checks; catalogue Settings unmount/reopen; short-height scrolling and swipe tests. |
| #15 | Supporting panels preserve mounted drafts through modal changes and Escape uses the active interaction scope after focus disappears. | Paired Send/Escape, nested and simultaneous surfaces, wide/modal transitions, composer reopen checks. |
| #16 | Anchored presentation uses the whole local canvas even offscreen; linked previews follow source scrolling and changing bounds. | `tools/browser/anchored-presentation.spec.ts` covers real paired Menu, Tooltip and HoverPreview behavior. |

Base UI owns focus trapping, accessibility hiding, scroll locking and drag mechanics. The private
policy owner supplies portal, bounds, interaction and focus-history choices. Collision adaptation
remains private to anchored adapters. Public workflow props stay unchanged.

The user accepted the physical iOS Safari retest after the preview scrolling and viewport fixes at
`1037d86`, completing #17's remaining keyboard acceptance. CDP touch tests cover drawer dismissal;
the device acceptance is recorded separately from those automated checks.

## Validation and review

Typecheck, lint, the full 193-test Vitest suite and product/design builds pass. All 246 browser
cases pass across phone, desktop and touch desktop. After the final ownership refactor, the
public presentation suite passed all 39 cases on the final integration code.

Standards review found no documented violations and two minor concerns: unused parent
relationships and duplicated focus-target validity checks. The final change uses parent
relationships to select the latest open leaf for Escape, and shares one private usability
predicate between dismissal and restoration. Both findings are resolved. Spec review found no
substantive gaps, unrequested behavior or incorrect implementations under the approved Base UI
scope and Search ADR.

The integration includes the prior Base UI prerequisite implementation and the ticket merges for
#13, #14, #16 and #15, followed by the review cleanup. GitHub closes these tickets and #8 directly;
no pull request is required by this repository's tracker workflow.
