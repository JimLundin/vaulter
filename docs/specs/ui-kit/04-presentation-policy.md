# Concentrate presentation policy

## Problem Statement

Users need overlays, settings drawers and supporting panels to keep working while the app resizes
and previews change shape. Maintainers currently coordinate that behavior across several modules:
each interprets the presentation context for portal scope, modal effects, outside interaction or
focus restoration. AdaptivePanel adds separate Escape and body-effect handling, while Drawer has
library-specific preview workarounds.

The reviewed behavior currently passes selected browser checks. The maintenance problem is that
one policy change can require several coordinated edits, making future iteration less predictable.

## Solution

Give shared presentation-environment policy one private owner. Public overlays keep their existing
interfaces and behavior while browser and bounded-preview environments consistently determine
bounds, interaction scope and modal policy. Library adapters retain their specialized mechanics;
tests continue to exercise public presentation behavior.

## User Stories

1. As an app user, I want a modal surface to keep focus inside it, so that keyboard actions stay in the active task.
2. As a screen-reader user, I want background content hidden while a production modal is active, so that navigation follows the current task.
3. As an app user, I want background scrolling locked during a modal, so that the page does not move behind it.
4. As an app user, I want a wide supporting panel to remain nonmodal, so that I can use the page beside it.
5. As an app user, I want panel resizing to preserve content and focus, so that a layout change does not interrupt editing.
6. As an app user, I want Escape to close the topmost active surface, so that nested tasks dismiss in a predictable order.
7. As an app user, I want closing a nested surface to leave its parent open, so that I return to the previous task.
8. As an app user, I want closing a surface to restore its opening control, so that keyboard navigation resumes in context.
9. As an app user, I want focus restored to an equivalent visible control after rearrangement, so that resizing does not strand focus.
10. As an app user, I want focus restoration to follow a command opened from Search, so that closing the next surface returns to a useful control.
11. As an app user, I want nested modals to release effects in the correct order, so that an open parent remains modal.
12. As an app user, I want final closure to restore background scrolling and accessibility, so that the page is usable again.
13. As an app user, I want backdrop dismissal to retain current behavior, so that pointer interactions remain familiar.
14. As a mobile user, I want overlays to fit the visual viewport, so that a keyboard does not hide required controls.
15. As a mobile user, I want settings content scrollable while its close action stays reachable, so that short viewports remain usable.
16. As an app user, I want viewport width and pointer density treated independently, so that a touch desktop remains comfortable.
17. As a design reviewer, I want sample portals bounded by their own canvas, so that previews remain comparable.
18. As a design reviewer, I want two samples editable independently, so that one overlay does not lock the whole catalogue.
19. As a design reviewer, I want outside interaction in another sample to leave this sample open, so that comparisons can stay visible.
20. As a design reviewer, I want Escape to dismiss only the active sample's topmost surface, so that keyboard actions remain local.
21. As a design reviewer, I want device switching to retain routes, drafts and open fields, so that layout review preserves context.
22. As a design reviewer, I want the preview banner usable while app surfaces are open, so that I can keep switching arrangements.
23. As an app user, I want dropdowns and tooltips to retain their placement, so that controls remain understandable.
24. As a design reviewer, I want off-screen sample positioning to use local bounds, so that the outer browser size does not distort the example.
25. As an app user, I want drawer drag behavior retained, so that policy consolidation does not remove an interaction.
26. As a kit maintainer, I want presentation policy owned in one place, so that a behavior change has locality.
27. As a kit maintainer, I want library-specific mechanics retained in their adapters, so that shared policy does not hide incompatible assumptions.
28. As a kit maintainer, I want unmount and scope changes to clean up effects, so that stale listeners and modal state do not survive.
29. As a workflow developer, I want public overlays to keep ordinary task interfaces, so that I do not learn preview or library workaround switches.

## Implementation Decisions

- Deepen the private presentation module around environment policy. It owns the scope's bounds,
  portal target, interaction ownership and rules for focus restoration and modal effects.
- Retain public Overlay, Drawer, AdaptivePanel, navigation/settings compositions, dropdown,
  tooltip and hover-preview interfaces. Workflows continue to express task state and actions,
  not library-specific or preview-specific configuration.
- Browser and bounded-preview environments are the actual policy variations. Keep that seam
  internal; public callers and tests continue to use existing presentation interfaces.
- A bounded scope uses its own size class and canvas for geometry and portals. Pointer policy
  remains independent of width and follows existing explicit sample or actual-device behavior.
- Production modal surfaces retain trapped focus, hidden background content and scroll locking.
  A wide supporting panel remains nonmodal. Bounded previews retain independent interaction and
  do not apply document-wide modal effects to the catalogue.
- Keep specialized interaction mechanics in the Base UI adapters. Shared scope choices come from
  the presentation owner. Do not rebuild library focus or drag behavior inside a generic overlay engine.
- Scope outside-interaction decisions and focus-target history to the owning presentation
  environment. An event originating in another bounded sample must not dismiss this sample.
- Coordinate Escape ownership through the scope so only the topmost relevant dismissible surface
  handles it. Integrate with existing library cancellation behavior; retain a visible private
  surface relationship where AdaptivePanel needs coordination rather than inferring another
  surface's existence from fixed DOM-slot selectors.
- Production Escape can dismiss the current modal even when focus belongs to it through a portal.
  In bounded previews, the active sample is selected by focus or interaction ownership; another
  sample's open state must remain independent.
- Restore focus to the valid visible opener; after rearrangement, use its equivalent within the
  same scope. Preserve existing useful focus history for a command opened from a disappearing
  Search surface. Never focus a removed node or an unrelated sample.
- Modal-effect acquisition and release must preserve active parents and overlapping surfaces.
  Reuse library ownership where it supplies the required behavior; privately coordinate custom
  panel effects with it. Cleanup restores prior state only when the affected ownership is released.
- Resizing and environment changes retain mounted content and uncontrolled field state. Policy
  changes must not switch to a second content tree or move the draft into the presentation module.
- Use the existing visual-viewport and CSS-token model for bounds. Retain safe-area spacing and
  reachable controls. Coordinate conversions and library collision rules remain specialized
  where necessary, using common scope facts.
- Inventory all current policy consumers and migrate repeated decisions. Retain existing overlay
  geometry, shape correspondences, scrolling ownership and lazy behavior.
- Closing, unmounting or changing a scope releases listeners, focus history and effects correctly.
  A bounded scope cannot reset another scope's document or local state.
- Keep public styling restrictions, private primitive ownership and catalogue coverage intact.
  Use the private-verification spec when organizing implementation behind internal seams.
- The context earns its keep under the deletion test. Deepening absorbs policy interpretation
  currently spread through callers, increasing leverage and locality without creating new workflow
  obligations.

## Testing Decisions

- The user confirmed public overlays in browser and bounded-preview environments as the test seam.
  Verify task-visible behavior; do not expose a private scope manager or test its internal stack.
- Use existing public-kit browser fixtures, the real product design preview and paired catalogue
  samples. Keep the actual Base UI adapters in browser tests.
- Retain prior art for settings focus, search selection, panel modal transitions, nested Escape,
  focus return, paired sample isolation, viewport resizing, preview mode changes and scrolling.
- Cover closing nested and overlapping surfaces in different orders. An active parent must retain
  focus protection, background hiding and scroll locking; final closure restores usable background.
- Verify inactive-sample outside interaction and Escape isolation, including two open samples and
  nested surfaces in the active one. Closing one leaves the other usable and open.
- Verify restored focus after rearrangement and a Search command transition. Assert visible focus
  and preserved task state rather than the private focus-history representation.
- Cover compact, expanded and wide arrangements, mouse and touch density, and bounded samples
  whose position lies outside the outer browser viewport. Assert local geometry and accessibility.
- Verify visual-viewport changes, short drawers, scoped dropdown/tooltip/hover placement, and
  existing drawer gestures where browser automation can exercise them reliably.
- Repeated open/close, unmount and scope changes must leave correct observable scrolling,
  accessibility and dismissal behavior. Do not count listeners or assert internal registrations.
- Run typecheck, the full Vitest suite, lint and the complete browser suite on phone, desktop and
  touch-desktop. Build product and design preview and review their live behavior.
- Completion requires all listed behavior preserved and repeated shared environment-policy
  decisions moved into one private owner. A private manager plus unchanged caller coordination
  does not satisfy the depth requirement.

## Out of Scope

A framework replacement, a global workflow overlay registry, new responsive breakpoints, new visual
designs, custom replacements for Base UI interaction mechanics, a separate mobile content tree,
and product state or routing changes. Composer and field association remain separate specs.

## Base UI scope update

The user approved replacing Radix and Vaul wholesale under #18 before completing this policy work.
#17 removes the public Sheet family and renames MenuSheet to Drawer. The optional Ask the agent
panel becomes a full-height bottom drawer on compact layouts; the main Agent page stays a page.
Dialog, Drawer, Menu and Tooltip now share Base UI layering. Search replaces cmdk with Base UI
Autocomplete so no transitive Radix remains. These decisions supersede the earlier library and
retained-interface references while preserving the public behavioral seam.

The child scopes in #13–#16 are superseded as follows; their user-visible acceptance criteria
continue to apply to the migrated public interfaces.

| Child | Base UI scope |
|---|---|
| #13 | Dialog, Search and Overlay consume the private policy owner. Sheet is removed; Drawer owns the former sheet compositions. Base UI Dialog retains production focus trapping, background hiding and scroll locking, with bounded portals and scope-local dismissal and focus return. |
| #14 | Settings and navigation use the single Base UI Drawer and shared policy. Base UI owns drag and modal mechanics; the Vaul/Radix preview workaround is removed. Nested Dialog/Menu surfaces preserve parent effects, and paired drawers remain independent. |
| #15 | AdaptivePanel uses one mounted Base UI Drawer popup across compact, expanded and wide arrangements. Shared policy chooses modality and geometry; Base UI owns focus and modal effects. Private scope relationships coordinate nested Escape without DOM-slot guesses or a custom panel effect stack. |
| #16 | Base UI Menu and Tooltip positioners consume shared portal and collision bounds. HoverPreview retains its specialized coordinate conversion while using the same bounds and interaction scope. Placement and outside interaction remain local to each sample. |

## Further Notes

This is fourth in the migration sequence because it has the broadest interaction scope. It does
not require new public test seams. Keep the change independently reviewable and migrate policy in
small implementation steps while the existing browser tests remain the behavioral reference.

At reviewed commit `61769fa`, selected focus, resize, nested Escape and preview-isolation checks
passed. This spec addresses maintenance friction and adds ownership-order coverage; it does not
claim those current user behaviors are broken. Physical phone keyboard and microphone validation
remains separate from synthetic viewport and scripted-capture checks.
