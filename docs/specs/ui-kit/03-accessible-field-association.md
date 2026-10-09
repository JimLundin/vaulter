# Own accessible field association

## Problem Statement

Settings fields display labels and descriptions, but each caller must manually connect those
elements to its control. Current product, catalogue and browser-fixture callers wire them
differently. Some fields have a working label without an accessible description; Appearance's
radio group has an independent name without the surrounding field description.

Users of assistive technology need the same field meaning as sighted users. Maintainers need
association rules owned by the field rather than repeated identifier coordination.

## Solution

Make SettingField own accessible label and description association for supported text controls
and radio groups. Feature adapters supply field meaning, values and persistence. Labels activate
text inputs, groups have correct group labelling, and repeated fields remain independent.

## User Stories

1. As a settings user, I want a field's visible label to name its text control, so that its purpose is clear.
2. As a screen-reader user, I want the field description announced with its control, so that I understand the setting before changing it.
3. As a pointer user, I want activating a text label to focus its input, so that the field is easy to reach.
4. As a screen-reader user, I want Appearance named as a choice group, so that I understand the options belong together.
5. As a screen-reader user, I want a choice group's description associated with the group, so that instructions remain available while choosing.
6. As a keyboard user, I want radio-group navigation retained, so that I can change Appearance without a pointer.
7. As a settings user, I want Model edits saved as before, so that improving associations does not change my preference.
8. As a settings user, I want Appearance saved as before, so that reopening Settings retains my choice.
9. As a workflow developer, I want to declare label and description once, so that identifiers do not need manual synchronization.
10. As a workflow developer, I want nested supported controls to associate correctly, so that ordinary layout composition remains possible.
11. As a workflow developer, I want custom control identifiers preserved, so that other valid references continue to work.
12. As a workflow developer, I want additional accessible descriptions retained, so that field instructions compose with other explanations.
13. As a workflow developer, I want ambiguous multiple-control fields rejected clearly, so that an invalid association cannot appear to work.
14. As a kit maintainer, I want one association owner, so that fixes have locality across settings.
15. As a catalogue reader, I want sample fields to demonstrate accessible behavior, so that examples are safe to reuse.
16. As a catalogue reader, I want paired fields independently labelled, so that desktop and mobile samples do not target one another.
17. As a settings user, I want repeated fields to remain independent, so that a label never focuses another field.
18. As a settings user, I want associations preserved through resizing, so that focus and field meaning survive rearrangement.
19. As a product developer, I want standalone inputs and theme choices still usable, so that field association does not impose a settings-only dependency.
20. As a kit maintainer, I want tests to assert names, descriptions and activation, so that identifier-generation changes do not rewrite tests.

## Implementation Decisions

- Deepen the public SettingField module to own association and arrangement. Feature adapters retain
  state, persistence, validation and actions; the kit does not acquire preference storage.
- A field represents one semantic control: either one supported text control or one supported radio
  group. A radio group may contain several choices; it is one control for field association.
- Labels and descriptions are declared at the field interface. Ordinary callers do not provide
  matching label, description and control identifiers in several places.
- Use a private field-association context consumed by the existing text-input and radio-group
  implementations. Nested ordinary layout helpers do not interrupt association; no DOM search or
  blind cloning of every child is required.
- Text fields associate the visible label with the input's effective identifier and associate the
  description with that control. Activating the label focuses the input through native semantics.
- Choice fields label and describe the radio group with group semantics. Do not use an input label
  relationship to pretend a group is a single text input or duplicate the description on every item.
- Preserve an explicit control identifier where one exists. Generate stable, unique identifiers
  for missing control, label and description identities within each field instance.
- Compose existing description references with the field description, deduplicating references
  and retaining their meaning. Within a field, its visible label is the authoritative field name;
  standalone control labels remain effective outside the association context.
- Require a clear failure for zero, multiple or unsupported semantic controls in a field, using
  typing where practical and a development diagnostic for otherwise ambiguous composition. No
  silent association with only the first or last nested control is accepted.
- ThemeSwitch continues to own its current theme choices and state. Its supported radio group
  participates in association when nested in SettingField and retains its standalone Appearance
  name when used independently.
- Standalone supported controls with no field context retain their existing identifier, accessible
  naming, description and keyboard behavior.
- Migrate Model, Appearance, catalogue Preferences and browser-fixture fields together. Remove
  repeated association identifier plumbing from these supported callers.
- Preserve responsive field arrangement, focus, uncontrolled values, public styling restrictions
  and paired examples. Use the preceding private-verification spec for extracted composition.
- The field already earns its arrangement under the deletion test. Greater depth absorbs the
  scattered association knowledge, adding leverage for callers and locality for accessibility fixes.

## Testing Decisions

- The user confirmed public SettingField as the test seam. Render its supported public text and
  group controls and assert accessible names, descriptions, label activation and keyboard behavior.
- Test a default text field, a field using an explicit control identifier, a nested text control,
  a radio group and ThemeSwitch. Assert semantics rather than generated identifier strings.
- Cover additional descriptions and deduplication by inspecting effective associations and their
  exposed meaning. Do not compare private context state.
- Render repeated fields and paired samples, activate each text label and verify only its own
  control receives focus. Resize while editing and verify value, focus and associations remain.
- Exercise clear failure for zero, multiple and unsupported semantic controls through the field
  interface. Valid groups with multiple radio choices must pass.
- Verify standalone inputs and ThemeSwitch retain their accessible behavior with no field context.
- Extend existing settings browser prior art for retained fields, focus, keyboard choice behavior
  and responsive arrangement. Add explicit accessible-description assertions where coverage is
  currently absent. Keep product checks for preference persistence.
- Run typecheck, the full Vitest suite, lint and the browser suite across phone, desktop and
  touch-desktop, followed by both builds.
- Completion requires correct text and group association, independent repeated fields, unchanged
  preference behavior and no manual identifier synchronization in migrated supported callers.

## Out of Scope

A generic form framework, new validation rules, preference-storage changes, arbitrary multi-control
field layouts, new control families or a redesign of Appearance. Composer and presentation policy
remain separate specs. Supporting additional semantic control families can follow when a real
caller needs them.

## Further Notes

This is third in the migration sequence. It requires the composition-verification change if
private composition helpers are introduced, but does not depend on the Composer interface.

Existing settings browser checks cover layout, focus and values. They do not establish accessible
description association for the current catalogue and fixture examples. The automated acceptance
adds that observable meaning explicitly.
