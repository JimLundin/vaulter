# UI kit architecture: four deepening changes

The four opportunities from the 9 October 2026 architecture review form this roadmap. The goal is
to iterate on the mini UI framework with confidence: callers learn less coordination, changes
have better locality, and tests exercise the same interface as the product and catalogue.

This document records scope and completion checks. Private composition verification is implemented
on `spec/5-private-composition-verification` and Composer interaction on `spec/6-composer-interaction`;
field association and presentation policy remain pending. The
[four individual specs](docs/specs/ui-kit/README.md) define ownership, interface behavior and
acceptance tests; they supersede this roadmap's earlier unresolved design questions.
Current architecture is documented in [ARCHITECTURE.md](ARCHITECTURE.md); the kit's presentation
rules and verification commands are in [its README](app/ui/kit/README.md).

## Execution order

| Order | Work | Why here |
|---|---|---|
| 1 | Let composition verification follow private modules | Enables internal seams without forcing helper exports or weakening presentation rules |
| 2 | Deepen Composer interaction | Highest immediate leverage: product and catalogue behavior already differs |
| 3 | Own accessible field association | Removes repeated association wiring and closes gaps in current examples |
| 4 | Concentrate presentation policy | Broader interaction change; preserve existing behavior while reducing scattered policy |

The order is a migration sequence, not a change in recommendation strength. Composer has the
clearest user-facing payoff. Verification is the small enabling change; presentation policy needs
the most careful browser validation. Each change should be independently reviewable and pass its
checks before the next begins.

## Preserve the useful structure

- Product, shared UI and workflows use the public kit interface in `app/ui/kit/index.ts`.
- The kit owns DOM, styling, type roles, spacing, responsive arrangement and presentation libraries.
- Public presentation accepts no `className` or `style`; the `unstyled()` adapter retains that rule.
- Feature values, persistence and task behavior remain in their workflows. Product wires them.
- Desktop and mobile rearrange the same content tree. Drafts, focus and uncontrolled fields survive.
- Public presentation has live paired catalogue examples. Private implementation needs no export
  merely to satisfy verification.
- Existing Radix and Vaul adapters retain their interaction mechanics. Introduce a seam only where
  actual behavior varies; a private helper does not need a generic adapter protocol.

Depth means fewer caller obligations, not fewer source files. Apply the deletion test to each
proposed module: deleting an earning module redistributes complexity to callers; deleting a
pass-through only removes indirection.

## 1. Let composition verification follow private modules

### Current friction

Before this change, `tools/composition.test.ts` recognized public building blocks and helpers
declared in the same source file. An imported private helper was rejected as uncatalogued even if
its implementation used only approved building blocks. Moving `ConversationToolbar` into a private
file therefore required changing verification or making the helper part of the public interface
and catalogue.

The presentation restrictions are useful. The helper-location restriction couples verification
to file arrangement and limits internal seams.

### Intended ownership

Deepen the composition verification module so it follows reachable private composition
implementations. Its interface should express the composition rules and return useful diagnostics;
its implementation owns compiler resolution, traversal and dependency collection.

Public building blocks remain approved stopping points: their implementations may own DOM,
styling and interaction dependencies. A private composition helper must be checked transitively
and cannot become a loophole for those operations.

### Migration scope

- `tools/composition.test.ts` and any private verification implementation needed by it.
- `app/ui/kit/composition.ts` and the gallery's **Built from** links.
- The kit README's description of checked compositions and private helpers.
- Keep `tools/layout.ts` and `tools/catalogue.test.ts` protections intact.

Resolve aliased imports and re-exports through the compiler; visit each reachable implementation
once and handle cycles. Retain the deliberately scoped roots in `composition.ts`. Derive each
composition's approved building blocks through private helpers so documentation remains checked.
Do not expand checking to the whole kit or extract unrelated helpers as part of this change.

### Completion checks

- [x] A checked composition can move a helper to a private file without new public exports.
- [x] Valid private helpers and context providers pass, including aliases and re-exports.
- [x] Raw DOM, styling props, styling spreads and intrinsic factories inside reachable private
      composition helpers fail with the offending file and location.
- [x] Unapproved interaction controls still fail; traversal does not silently accept unresolved
      targets or arbitrary external imports.
- [x] Public primitive implementations retain their permitted DOM and styling.
- [x] Cyclic references terminate, and duplicate references do not duplicate diagnostics.
- [x] Catalogue coverage, public import restrictions and **Built from** links remain accurate.

Use temporary source fixtures to test the policy interface. Tests should survive a private helper
move; they should fail when supported composition rules are violated. The locality gain is that
private implementation changes stay private; the leverage is one policy across checked modules.

### Implementation specification

[Private composition verification](docs/specs/ui-kit/01-composition-verification.md) defines
compiler-resolved traversal, approved stopping points, diagnostics and checked metadata.

## 2. Deepen Composer interaction

### Friction addressed

Before this change, `Composer` presented a fieldset and `ComposerActions` an inset addon. Callers
coordinated `Form`, the composer input group, a one-row textarea, focus state, keyboard submission
and Send behavior.

`app/workflows/chat/Chat.tsx` submitted through `requestSubmit()` and guarded Safari's IME
`keyCode 229`. The Agent example in `catalogue.tsx` called its send function directly and omitted
that guard. The catalogue Agent panel had another assembly without the same keyboard behavior.
The interface was shallow because callers had to know those implementation details.

### Implemented ownership

Shared text-entry arrangement, keyboard submission and focus presentation belong to the public
Composer. Real Chat and catalogue adapters supply their values and actions to the same
implementation. The workflow continues to own draft persistence, speech capture, transcript
reconciliation, staged-change review, sending and cancellation.

Submission from Enter and the button follows the same workflow callback. One stable textarea,
inset actions and the existing responsive roles remain in place. Suggestions and voice status retain
their positions outside and above the anchored message field.

### Migration scope

- `app/ui/kit/conversation.tsx` and private Composer implementation as needed.
- `app/workflows/chat/Chat.tsx`.
- Agent, Agent panel and relevant primitive examples in `app/ui/kit/catalogue.tsx`.
- Public exports and composition metadata affected by the final design.
- Existing Composer checks in `tools/browser/framework.spec.ts` and `catalogue.spec.ts`.

All current Composer callers use the shared implementation. Chat observes focus for suggestion
visibility; Composer owns the send icon's focus rule. Existing input-group and button primitives
retain their measured insets and touch targets.

### Completion checks

- [x] Enter submits; Shift+Enter inserts a newline without growing the composer.
- [x] IME composition and Safari `keyCode 229` never submit, in product and catalogue adapters.
- [x] Enter and Send use the same submission path and cannot bypass workflow review.
- [x] Empty or whitespace-only drafts, recording and busy states retain current submission rules.
- [x] Send shows the focus-dependent icon and becomes the sole response Stop control when busy.
- [x] The microphone and editable/read-only field retain their existing behavior.
- [x] Typed and dictated text continue to share the persistent workflow draft.
- [x] Resizing, panel rearrangement and preview mode changes preserve the field and draft.
- [x] The field remains one row with clear inset actions at mouse and touch density.
- [x] Catalogue samples retain independent drafts while using the same interaction implementation.
- [x] Caller code no longer repeats Composer keyboard submission and focus bookkeeping.

The interface is the test surface: test observable input behavior in a browser through the shared
module and its real callers. Retain meaningful workflow integration checks. A separately tested
keyboard predicate would leave the coordination bugs in place. Depth gives leverage to every
Composer caller and locality to fixes for entry behavior.

### Implementation specification

[Composer interaction](docs/specs/ui-kit/02-composer-interaction.md) defines controlled entry,
one submission path, keyboard rules, state ownership and focus observation.

## 3. Own accessible field association

### Current friction

`SettingField` owns label, description and arrangement, but callers must coordinate `htmlFor`,
`descriptionId`, the nested control's `id` and `aria-describedby`.

Chat settings supplies all four. Catalogue Preferences and the browser fixture associate the
label but omit the description link. ThemeSwitch names its radio group independently of the
surrounding field label and description. Existing settings tests cover layout, focus and values,
but do not assert accessible descriptions.

### Intended ownership

Deepen the field module so it owns accessible label/description association as well as responsive
arrangement. Feature adapters continue to own values and persistence. Text controls and radio
groups are existing, concrete consumers; their different semantics justify considering both.

Use the proper association for each control. A text label may target an input; a group needs
appropriate group labelling. Preserve descriptions supplied by callers rather than replacing
unrelated accessible-description identifiers.

### Migration scope

- `app/ui/kit/settings.tsx` and relevant field/input/radio primitives.
- `app/workflows/chat/settings.tsx`.
- Product's Appearance field and `app/ui/kit/theme.tsx`.
- Settings examples in `catalogue.tsx` and `tests/browser.tsx`.
- Accessible-field browser checks and affected composition metadata.

Keep standalone inputs and ThemeSwitch usable outside a settings field. Remove repeated field
identifier plumbing from migrated callers. Account for duplicate fields rendered in paired samples.

### Completion checks

- [ ] Text controls have the expected accessible name and description.
- [ ] Activating a text field's label focuses its control.
- [ ] Radio groups have the field name and description with correct group semantics.
- [ ] Caller-supplied descriptions are composed without duplicate or broken identifiers.
- [ ] Paired and repeated fields have independent, valid associations.
- [ ] Appearance and Model retain values, persistence, keyboard behavior and responsive arrangement.
- [ ] Supported field callers no longer manually synchronize association identifiers.
- [ ] Standalone controls retain their accessible names and behavior.

Test through the field interface with both text and group controls. Assert accessible names,
descriptions and label behavior, not generated identifier strings. Greater depth gives locality
to association fixes and leverage to every settings field.

### Implementation specification

[Accessible field association](docs/specs/ui-kit/03-accessible-field-association.md) defines one
semantic control per field, private association context, text/group semantics and standalone use.

## 4. Concentrate presentation policy

### Current friction

The private presentation context exposes layout and a portal. Dialog, Sheet, DropdownMenu and
Drawer each interpret those fields to choose modal behavior and portal scope. Drawer includes
a preview-specific Vaul/Radix workaround. AdaptivePanel separately manages Escape, focus,
accessibility hiding and body overflow, including queries for other overlay DOM slots.

The context earns its keep: deleting it would redistribute real scope knowledge. The opportunity
is to deepen it so each caller needs less policy knowledge. This is observed maintenance friction;
the reviewed focus, resize and isolation scenarios currently pass.

### Intended ownership

Concentrate shared presentation-environment policy behind a private module seam: bounds, portal
scope, interaction scope and the rules for modal effects and focus restoration. Browser and
bounded-preview environments are real variations. Radix and Vaul adapters retain specialized
mechanics, including dragging and library-specific workarounds.

The module should reduce repeated interpretation of the environment. It should not expose
library workaround switches to workflows or force every overlay shape into one implementation.

### Migration scope

- `app/ui/kit/presentation.tsx`, `preview.tsx` and relevant private hooks.
- `parts/dialog.tsx`, `drawer.tsx`, `sheet.tsx`, `dropdown-menu.tsx` and `tooltip.tsx`.
- AdaptivePanel in `primitives.tsx` and scoped HoverPreview behavior in `surfaces.tsx`.
- `overlay.tsx`, `sheet.tsx` and scoped presentation rules in `styles.css` where affected.
- Browser coverage for framework, catalogue, preview and scrolling behavior.

Inventory policy consumers first. Migrate repeated policy in small steps while retaining stable
content trees and existing geometry. Treat coordinate conversion, collision placement and drawer
mechanics according to their actual needs; they need not share one implementation.

### Completion checks

- [ ] Production modal surfaces trap focus, hide background content and lock scrolling correctly.
- [ ] A wide supporting panel remains nonmodal; resizing preserves its content, draft and focus.
- [ ] Escape dismisses the topmost relevant surface and closing restores the opening control or
      its equivalent after rearrangement.
- [ ] Nested surfaces release accessibility and scrolling effects without disrupting an open parent.
- [ ] Bounded samples keep portals local, allow independent editing and leave the catalogue usable.
- [ ] Interacting with one sample does not dismiss another sample's surface.
- [ ] Design preview mode changes retain open settings/search, fields and routes.
- [ ] Visual viewport resizing keeps composer and overlays within available bounds.
- [ ] Scoped dropdowns, tooltips and hover previews retain their placement.
- [ ] Closing or unmounting cleans up effects and listeners in the correct environment.
- [ ] Overlay callers no longer repeat shared environment-policy decisions.

Exercise behavior through public presentation interfaces in browser and bounded-preview
environments, using existing library adapters. Retain meaningful focus, nested Escape, resize,
preview isolation and scrolling checks. The locality gain is one place to change environment
policy; the leverage is consistent behavior across several overlay families.

### Implementation specification

[Presentation policy](docs/specs/ui-kit/04-presentation-policy.md) defines scope ownership,
library coordination, dismissal, restoration and effect cleanup across real environments.

## Verification and delivery

At reviewed commit `61769fa`, typecheck, 11 selected kit/policy tests and 18 selected browser
checks passed. This baseline covered selected scenarios, not the full test suite; it does not
establish coverage for the field-association gaps or catalogue IME divergence described above.

For each implementation change:

1. Add or adapt behavior checks that can fail for the concrete problem being addressed.
2. Implement the deeper module and migrate its actual callers together.
3. Remove obsolete duplicated implementations and tests that only assert private arrangement;
   retain distinct workflow integration behavior.
4. Run the kit's required checks: `npm run typecheck`, `npm test`, `npm run lint` and
   `npm run test:ui` across phone, desktop and touch-desktop projects.
5. Update the kit README, public examples, composition metadata and architecture documentation
   to describe the resulting ownership and interface. Keep future work distinguished from
   implemented behavior.

Complete the work with `npm run build` and `npm run build:design`, then review both the live
product preview and paired catalogue. Synthetic IME and visual-viewport tests remain useful;
physical phone keyboard and microphone behavior still need device validation.

### Overall completion

- [x] Composition verification supports checked private helpers without weakening kit-use rules.
- [x] All Composer callers share input interaction behavior.
- [ ] Supported settings fields own their accessible associations.
- [ ] Shared presentation policy has one owner with library mechanics retained in their adapters.
- [ ] Required checks and both builds pass; documentation and live examples match the implementation.

The plan adds no framework replacement, workflow registry or unrelated file reorganization.
All four changes should earn their depth through reduced caller obligations and verification
through the same seams the product uses.
