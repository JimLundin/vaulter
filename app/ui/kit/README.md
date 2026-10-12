# The kit

The app's component kit, imported from branch `ui-kit` at `2c30183`. Its reference design is in
`design/`. Product, shared UI and workflow screens compose `index.ts`; no public component takes
`className` or `style`. Tailwind scans only this folder.

The implemented [ADR 0006](../../../docs/adr/0006-module-ui-and-shared-presentation.md) keeps
record-specific UI in Chat, Wiki, History and Search while the kit owns shared presentation.
One supporting-pane policy owns geometry and interaction across those clients. The
[ownership plan](../../../docs/plans/ui-module-ownership.md) records delivered acceptance and the
[public inventory](../../../docs/ui-presentation-inventory.md) lists every export, actual consumers
and retired destination.

`composition.ts` explicitly inventories every implementation source and exact named declarations
that own DOM/library mechanics. All other declarations are checked compositions of approved
presentation, including private helpers and public wrappers such as Overlay, ItemGroup and
SidebarMenu. Mixed files do not receive blanket exemptions. A new implementation source or native
presentation declaration needs an explicit role; public exports still need live catalogue examples.
Genuine mechanics include native page geometry, responsive navigation, Base UI primitives,
passage clipping and bounded positioning. State providers and control compositions remain checked.
Module views use typed payloads/projections plus actions; reading/subscription/execution stays with
the module. Compose SupportingPane with content, requested visibility and optional anchored dock;
its width/header/focus/scroll/compact transition are kit policy rather than caller choices.

History-specific presentation has moved to History. `ExpandableRow` owns shared disclosure,
metadata placement and details geometry; `RowAction` owns compact accessible action presentation.
Callers supply title, metadata content, explicit expansion state, actions and details. The kit does
not interpret transaction sequence, authors, origin, differences or compensation policy. Its paired
Expandable rows catalogue example uses plain fictional items rather than a Git-shaped History
record. The live fictional preview exercises History's actual NodeStore → `NodeHistoryEntry` →
`TransactionItem` pipeline, including confirmation and guarded compensation.

The [UI kit architecture plan](../../../PLAN-ui-kit-architecture.md) tracks four
deepening changes: private composition verification, Composer interaction, accessible field
association and shared presentation policy. The
[individual specs](../../../docs/specs/ui-kit/README.md) define their implementation and tests.
The [Base UI migration](https://github.com/JimLundin/vaulter/issues/18) establishes the foundation for
[presentation policy](https://github.com/JimLundin/vaulter/issues/8): it replaces every Radix/Vaul
primitive with Base UI and supplies the single public `Drawer` used by compact side panels,
navigation and settings. Search uses
Base UI Autocomplete; cmdk is removed.

`npm run kit` opens the live catalogue, using the same local fonts and theme as the app. Every
public presentation component appears in a component family with an 800px desktop sample beside a
390px touch sample. Both run the same sample implementation. Search by component or family name;
on narrow screens, each comparison scrolls horizontally. Reference screens remain design artifacts.

`catalogue.tsx` contains the sample data and component coverage. `tools/catalogue.test.ts` compares
its registrations and rendered JSX against all public component exports, so adding a component
without a live example fails CI. `tools/layout.test.ts` rejects intrinsic JSX, styling props (including
object spreads), intrinsic element factories, private kit imports and direct presentation dependency
imports throughout Product, shared UI and workflows. Semantic forms use the public `Form` component.
Only exact Wiki block semantic markup and Chat code/error content retain narrow rendering permissions;
new renderer helpers cannot implement layout, styling, controls or scrolling. The exact vault-link
annotation transform may annotate semantic data, with no UI presentation permission.

| Where | What |
|---|---|
| `index.ts` | public components, icons and theme controls |
| `catalogue.tsx`, `gallery.tsx` | live examples, component coverage, search and paired catalogue |
| `presentation.tsx` | shared bounded PresentationPreview adapter and private production context |
| `presentation-policy.tsx` | private owner of scope, modal choice, dismissal, focus history and popup bounds |
| `preview.tsx` | floating `DesignPreview` controls, adaptive viewport and Mobile width toggle |
| `parts/`, `hooks/` | shared layout/type primitives, shadcn controls and their hooks |
| `primitives.tsx` | reusable surfaces, reading/dock geometry and following scroll container |
| `composition.ts` | checked building-block dependencies displayed in the gallery |
| `app.tsx` | spacing, typography, pages, expanded sidebar and shared workspace frame |
| `overlay.tsx` | one dialog tree, centered or bottom-aligned; full-screen search in compact space |
| `drawer.tsx` | the public `Drawer`, centered in expanded space and rising from the bottom in compact space |
| `navigation.tsx` | `NavigationSuite`: one navigation as a sidebar or a bottom bar |
| `conversation.tsx` | neutral message attribution, composer, voice and suggestions mechanics |
| `command-overlay.tsx` | shared responsive command-list overlay |
| `expandable-row.tsx` | shared disclosure, metadata and compact actions |
| `settings.tsx` | feature-named settings menu and shared form rows |
| `field-association.ts` | private association state consumed by text controls and radio groups through nested layouts |
| `surfaces.tsx` | gates, preview notice, tool results, panels and unified diffs |
| `chart.tsx`, `diff.tsx`, `map.tsx` | accessible charts, code diffs, lazy map presentation |
| `styles.css`, `theme.tsx` | zinc color tokens, light/dark/system theme |
| `design/` | original canvases and standalone screen references |
| `tests/`, `tools/browser/` | markup/theme checks and browser interaction coverage |

Fonts are Geist, Geist Mono and Newsreader, loaded locally from `@fontsource-variable`. Add generic
presentation here and keep domain behavior in its workflow. `tools/layout.test.ts` checks that all app
views compose public exports and avoid ad hoc styling. Markdown content rendering is a scoped
exception. Maps require `https://tiles.openfreemap.org` in the consuming page's CSP; the current
product does not use maps.

The composer uses one primary action across Product, the preview and catalogue: microphone when
unfocused, Enter when focused, and a supporting Stop action while responding. Microphone and Enter
use the shared Filled style. The design preview pill contains a Mobile toggle, variant choices, the kit link and reset;
the completed A/B/C input-style comparison has been removed. See [input-button.md](input-button.md).

The preview fills its available window by default and adapts as that window changes. Turn on Mobile
to constrain the app to 390px (or the available width on narrower screens); turning it off restores
adaptive sizing. The grip icon at the bar's edge supports dragging, arrow-key movement and Home to
reset its position. On compact screens a separate chevron expands the controls.

## Foundation and spacing

Controls originate from **shadcn/ui**, with **Base UI** for interactions and **Tailwind** for styling.
They are owned source in `parts/`, not a separately themed
component library. Vaulter defines the layout, type, colors and responsive roles on top of them.
Search uses inline Base UI Autocomplete behind the existing Command interface. Command retains
automatic filtering, empty-state announcements and keyboard selection; Product supplies ranked
results with `shouldFilter={false}`. The [Search decision](../../../docs/adr/0001-base-ui-search.md)
records why cmdk was removed and the clarified scope: default Command uses Base UI text matching
in caller order; legacy cmdk options are not a compatibility target. Composition uses Base UI's
`render` prop, `useRender` and `mergeProps`.

Adapters preserve kit behavior where library defaults differ: dropdown labels can stand alone,
checkbox selections close their menu, and dialogs respect each surface's initial-focus choice.

Short modal tasks use adaptive `Overlay`; Search uses shared `CommandOverlay` and preferences use
`SettingsMenu`. Generic public Dialog assembly, CommandDialog and SettingsPage are retired.
Private Base UI dialog adapters still support Overlay and Search focus, dismissal and accessible
titles. `DialogFooter` remains a standalone optional layout for caller-supplied actions: right-aligned
on desktop and stacked on phones. Its optional close action remains available; overlays need not
use a footer.

`CommandOverlay` owns compact full-screen and wider command-list geometry, input focus and
dismissal mechanics. Its callers supply the title, close label and presentation content. Search
owns query state, ranked entries, recent entries, task groups and navigation/command/ask actions;
its typed `SearchView` renders resolved `Hit`/`Entry` values and explicit actions without a vault
adapter or Agent controller. The catalogue demonstrates generic item selection through the same
overlay, with paired bounded presentation. Search-specific `SearchSurface` is removed.

Spacing uses a 4px scale: 4px between inset actions, 8px between related controls, 16px within
content and 24px between sections. `--space-control`, `--space-row`, `--space-content` and
`--space-section` define those roles in `styles.css`; Stack and Row use the same scale. Pointer
density changes the control size from 32px to at least 44px without enlarging the gaps. Sidebar
labels, badges, options and nested content occupy separate grid slots; touch actions never rely on
oversized invisible hit areas or fixed absolute offsets.

Button has four styles: `filled` for primary create/submit actions, `outline` for secondary actions,
`ghost` for quiet controls and `destructive` for destructive actions. Its two sizes are `standard`
(44px) and `compact` (32px); `iconOnly` makes either size square without changing its corners.
Touch controls retain a minimum 44px target. `InputGroupButton` uses these same sizes, defaulting to
compact ghost, and only removes the shadow for its inset placement. The same action retains its
role across devices. Navigation uses `Link` rather than a link-colored Button.
Ordinary controls have 8px corners, and their hover/focus backgrounds follow that shape. The
mobile footer fixtures keep a 44px square target with rounded hover backgrounds.
The Agent microphone and Enter use the same filled 44px icon control inside the composer on both
devices; Stop uses outline. The field shows exactly one action when voice is available.

Text-entry submission uses `InputGroup` with `InputGroupAddon align="inset-end"`. The action sits
inside the editable field's bounds; the group reserves its measured width plus an 8px gap, including
when labels, touch targets or visible actions change size. `InputGroupTextarea variant="inline"`
remains 44px high; `InputGroup variant="composer"` supplies the composer's outer shape. Agent,
quick-note and vault-access examples use the same primitives.

General fields retain standard semantic legends and vertical or horizontal arrangements; Settings
keeps its adaptive label/control grid. Grouped input context sits inline before or after the field,
with measured inset actions at the end. Smaller legends, generic responsive Field rows and
above/below grouped-input add-ons are retired.

Voice/activity presentation keeps meaningful status labels and visible LiveStatus text. Question
answers support list and inline layouts with supplied recommendation emphasis. Ordinary keycaps
and labelled shortcut sequences remain; elapsed Recording, decorative StatusMark, numeric answer
hints and enlarged/strong keyboard-hint variations are retired.

## Desktop and mobile variants

Mobile and desktop are the **same UI, resized and rearranged**. Components share their content,
state, actions and design roles. Compact space stacks and moves those same pieces; expanded space
spreads them out. Text labels can collapse to accessible icons; the message field stays visible in
both arrangements without introducing different features or a second product design.

The size classes are **compact** (under 48rem), **expanded** (48rem and up), and **wide** (80rem and
up, enough for a side panel). Width and input method are independent: a wide screen may use touch.
`Columns` keeps two or three equal desktop content columns and always stacks them on phones.
Tabs use rounded horizontal choices, preserving automatic/manual activation and optional mounted
inactive content. Timeline illustrates planned Today/activity events; ListDetail supplies question
inbox or record-browser panes. Their examples do not implement event collection, selection or Back
navigation.
The model is Material 3's adaptive navigation
(`NavigationSuiteScaffold`: one item list shown as a bar, rail or drawer) and SwiftUI's
`sidebarAdaptable` tab view (one definition, a tab bar on iPhone and a sidebar on iPad).

### Correspondences

Every pair below is one component or one slot, not two designs. A new component either fits a row or
adds one.

| Expanded (desktop) | Compact (phone) | Kit |
|---|---|---|
| Sidebar | Bottom bar, plus the menu drawer it opens | `NavigationSuite` |
| Sidebar list of destinations | Menu drawer rising from the bar | `NavigationSuite` → `NavigationSheet` → `Drawer` |
| Sidebar search field (⌘K) | Search icon in the bar | `NavigationSuite` `search` |
| Sidebar footer rows (Settings) | Icons in the bar | `NavigationSuite` `actions` |
| Optional primary sidebar control | Optional floating control above the bar | `NavigationSuite` `primary` |
| Brand and sync status at the sidebar's top | Menu drawer header | `Brand` |
| Page header at the top of the reading column | Bordered header strip | `PageHeader` |
| Centered dialog | Bottom-aligned dialog | `Overlay` |
| Settings dialog over the current feature | Settings drawer, sharing Menu's surface | `SettingsMenu` → `Drawer` |
| Side panel (wide) or centered dialog | Full-height bottom drawer | `SupportingPane` → `Drawer` |
| Labelled toolbar buttons | Icon buttons with an `aria-label` | Chat-owned composition over `Toolbar`, `AutoScrollArea` and `Dock` |
| Form rows: label left, control right | The same fields stacked vertically | `SettingsMenu`, `SettingField` |
| One-row composer with inset microphone and send | The same always-visible field and inset controls | Chat-owned composition over `Toolbar`, `AutoScrollArea` and `Dock`, `Composer` |
| Titled expandable rows with labelled actions | The same rows with accessible icon actions | `ExpandableRow`, `RowAction` |
| Single horizontally scrolling prompt row | The same row, with a fade at clipped edges | `PromptSuggestions`, `OptionStrip` |

**Navigation is declared once.** The product lists every place as data (`Navigation` in
`ui/command.ts`). A *destination* (the default) is a place in a list that may grow without limit: the
agent, history, a note, a calendar. An *action* (`kind: 'action'`) is one of the few controls every
screen keeps. The bottom bar keeps the first three actions beside Menu and Search; additional
actions move into the menu. Ordinary bar controls are square and icon-only with the standard control
radius on hover and open-state backgrounds; Menu is highlighted only while its drawer is open.
Desktop navigation stays expanded on the left; it has no collapse shortcut, state or cookie.
Sidebar primitives retain plain rows, visible actions, headings/groups, nested destinations,
counts, separators and optional-icon loading rows for planned navigation. `SidebarProvider` is
now a generic workspace wrapper, and `SidebarInset` retains only its generic content layout.
Loading Skeleton presentation remains private to the usable navigation loading rows.
The current feature is marked in the drawer. The voice action floats
above them as a circle. `Frame` hands both lists to `NavigationSuite`, which picks the shape. Adding a feature means adding an entry, not editing two
layouts.

**Feature preferences are assembled once.** `SettingsMenu` takes `{ name, content }` entries from
Product, using each name as its section heading. Fields and persistence remain in the feature's
settings view; the kit owns grouping and arrangement. Appearance stays an application section.
Settings opens over the current destination without changing its route or discarding its draft.
`FeaturePage` centers History and other screens on the same `--reading-width` as Agent. Page text
remains left aligned within that centered column.

`SupportingPane` is the shared supporting presentation seam. Supply `title`, `open`, `onClose`,
content and optional header/actions. A `selection` identity resets its scrolling body. Supplying
`dock` selects a following feed above an anchored dock, with optional `status` and `empty` inputs;
do not wrap those children in another scrolling feed. `persistent` requests desktop occupancy.
The kit owns the 340px width, header, inset, `md` transition, dismissal, gestures, focus return and
bounded portals. Expanded/wide content stays beside the page; compact content uses the full-height
bottom Drawer. Chat supporting content, saved-conversation selection, Wiki references and paired
generic examples consume this seam. `ConversationPanel`, `AdaptivePanel` and reading-support
wrappers are retired; generic examples use the same supporting presentation seam.
Wiki composes its typed page view from shared reading/page/section presentation and `SupportingPane`;
`WikiPageSurface` and shell styling are removed. Shared `PassageCard` owns source-card presentation; Wiki retains citation interpretation.

`PassageCard` receives title content, presentation text and optional half-open selection offsets,
attribution/notice/empty content and disclosure/context labels. It owns clipping, fade feedback,
keyboard/touch disclosure, a bounded expanded text scroll owner and selected-text visibility.
The module decides what the retained selection and notices mean and supplies safe navigation.
The kit does not inspect source records, determine support or rewrite text. Paired neutral examples
show independent disclosure, a long marked passage and absent text. Source context expansion and
user scrolling stay mounted across pane/device changes. Wiki source-card CSS and its renderer
exception are removed; shared mechanics live in `passage-card.tsx`/`passage-card.css`.

### Primitive composition

Agent and Settings contain no intrinsic HTML, CSS classes or inline styling. They assemble public
building blocks. `Button` owns shared action styles, sizes and icon-only layout. `OptionStrip` owns
prompt-option presentation. The composer uses the shared primary and supporting action styles.
`InputGroup`,
`InputGroupTextarea variant="inline"` and `InputGroupAddon align="inset-end"` own the one-row
field and inset actions. `Field orientation="setting"` owns responsive
label/control/description placement. Theme choices use the shared `RadioGroup` primitives.

`parts/layout.tsx` owns Stack, Row, Text, Heading, Link and Prose independently of application frames.
Row/Stack can express semantic fieldsets. Prose owns document spacing and table/code overflow;
Wiki supplies approved markup and content meaning. `Button variant="inline"` presents inline title
and citation actions without expanding prose line boxes on touch devices. `Toolbar` uses the same
48px header token and inset for every module. Its optional label names the toolbar.

`Surface`, `Toolbar`, `ReadingColumn`, `Dock`, `OptionStrip`, `AutoScrollArea` and
`SupportingPane` provide reusable containers and behavior. Each has a separate paired example.
`Drawer` owns the drawer adapter, header, close button, typography and scrolling body for navigation,
settings and supporting panels. Callers supply `open`, `onClose`, `title` and content; bare drawer
parts and side sheets remain outside the public interface. The desktop sidebar has no mobile
overlay path: `NavigationSuite` owns its compact bottom bar and navigation drawer.
The private presentation owner chooses portal scope, modal policy, dismissal ownership and
focus return; the Base UI adapter owns focus trapping, background effects and swipe mechanics.
Closing nested or overlapping drawers preserves any remaining modal task. Bounded Settings
examples stay independently editable and release their scope when catalogue filtering unmounts them.
`WorkspaceFrame` supplies the shared workspace through `NavigationSuite`. DesktopMain and
MobileFrame alternatives have been retired, including the latter's reserved notice row. Existing
Notice attention cards and Toaster notifications remain; notification integration and placement
are tracked separately in #22.
Chat supporting content uses `SupportingPane`, sharing expanded inline and compact Drawer
geometry with conversation selection. Supporting panes keep one mounted draft field as they
change arrangement. A nested review or details drawer
closes first and returns focus to its parent; changing the parent arrangement keeps the child
task modal until it closes. Bounded Escape follows usable focus
or the latest interaction when an action disables its focused control, and catalogue controls can
take keyboard ownership back. The adaptive-panel example includes nested review and details actions.
The gallery shows **Built from** links on these compositions. `composition.ts` lists their
building blocks, including usage through private helpers. `tools/composition.ts` checks the configured
roots in `conversation.tsx`, `settings.tsx` and `theme.tsx` as whole sources, then follows
reachable private presentation helpers and state-only React context providers. Named imports, aliases
and re-exports resolve through the compiler; extracted helpers need no public export or catalogue
registration. Raw HTML, styling props and spreads, intrinsic factories and unapproved or unresolved
presentation targets fail at their offending source and location. Cycles terminate and shared
references produce one diagnostic. Approved public building blocks, including `unstyled()` exports
and their wrapped parts, stop traversal: their implementations own DOM, styles and interaction
libraries. CI and temporary-project tests use the same policy interface to check violations and each
root's declared building-block metadata. This check covers these compositions and their reached
private declarations; the app-wide rule continues to cover all kit callers.

Preview canvases, long examples, option strips, settings bodies and conversation feeds share
`ScrollArea`. Overflow gets a visible 12px track without requiring hover. Full-height samples use
the interior canvas height, excluding borders, and avoid an extra outer scrollbar. The conversation
feed connects the follow-to-end behavior to that same viewport, so wheel/touch scrolling and
**Latest reply** operate on one scroll owner.

### Live comparisons

The gallery does not embed another document. CSS responsive utilities query the nearest named
`kit` container: the browser body for the app, or the sample canvas in the catalogue. The private
presentation scope supplies the matching React size class and bounds viewport-sized pieces and
portals to that canvas. Touch policy is explicit in the phone sample and follows the actual pointer
in the app. Sample dialogs remain local and do not lock or hide the catalogue; production modal
focus, scroll locking and focus return still use the normal browser behavior. These previews show
layout and control behavior; they do not simulate a phone browser keyboard or microphone.

The sample app uses public `DesignPreview` to center a floating dark pill over the workspace.
Desktop shows its device and variant choices, kit link and reset in one row; on phones, tap the Preview pill to
expand those same controls, then tap outside or press Escape to collapse it. **Window** follows
the browser width, **Desktop** keeps a minimum 1024px workspace,
and **Mobile** centers a 390px touch viewport, constrained to the browser width. Switching modes
rearranges the same mounted product and retains routes, drafts and open settings/search fields.
Portals stay inside the selected viewport while the pill remains available. The frame follows
the full visual viewport height, with the pill overlaying the app without reserving any layout
space. The pill respects the top safe area.
Drag the Preview label to move the pill with a mouse or touch. Its controls stay clickable,
and its position is constrained when the panel expands or the visible viewport changes.
With the label focused, arrow keys move it (Shift moves faster) and Home returns it to the top
center. Position belongs to the mounted preview and resets on reload.

`DesignComparison` supplies named alternatives and owns the selected variant. Its optional
`preview` render callback receives the picker and selected content; pass the picker through
`DesignPreview.variantControls` to put it beside the device choices in the floating pill.
The live app currently registers one "Current design" alternative. The catalogue registers
Note summary and Question summary to demonstrate independent variant selection. Device changes
preserve the selected variant and its mounted fields; switching variants starts that variant's
content afresh. The control shows previous/next arrows, a focusable current-design button and the
design's position. Click either arrow or focus the label and press Left/Right to cycle, wrapping
at each end. Clicking the label advances once. Keyboard cycling stays inside the focused control,
so text editing, device navigation and other previews remain independent. A sole design disables
both arrows. Phone and desktop use the same interaction. Standalone `DesignComparison` retains
its inline cycle control; supplied alternatives use the same control.

### How a shape is decided

What differs between size classes is decided at three levels, and a component uses the lowest one
that works:

1. **Tokens (CSS only).** Type roles carry a phone value and a desktop value in `styles.css`; a
   component writes `text-display`, rather than choosing its own pixel sizes. Body copy and labels
   have one size: text on a phone never shrinks.

   | Role | Phone | Desktop | For |
   |---|---|---|---|
   | `text-display` | 32 | 40 | a serif page title, the agent's welcome |
   | `text-title` | 22 | 26 | a sans page title |
   | `text-lead` | 17 | 19 | long-form serif prose |
   | `text-copy` | 15 | 15 | body text |
   | `text-label` | 13 | 13 | secondary text, rows, suggestions |
   | `text-caption` | 12 | 12 | metadata, hints, speaker names |

   Controls use `text-control` / `text-sm` (14). Fields use `text-field` (14 with a mouse, 16
   when touch is available, preventing mobile focus zoom). Keycaps, counts and citations use
   `text-glyph` (11). `--page-inset` and `--page-block` resize spacing centrally;
   `--reading-width` gives feature screens one centered content width. The composer stays 44px high
   inside a 54px surface at every size, with controls beside the field. Long drafts and explicit
   newlines scroll inside that single row.
   Radii have roles and don't change by device: `rounded-md` controls, `rounded-lg` fields,
   `rounded-xl` cards and rows, `rounded-2xl` docked surfaces such as the composer.
2. **Pointer, not width.** `styles.css` applies a 44px minimum target whenever **any pointer** is
   coarse, including touch desktops. It covers all button sizes, checkboxes, inputs, grouped inputs,
   tabs, ToggleGroup choices, command/menu rows, sidebar controls, retained close actions and map controls.
   Checkboxes keep a 16px mark inside the target. Chart marks scroll horizontally when there are
   too many touch targets to fit, and map markers keep their small visual inside a larger target.
   Custom standalone controls opt in with
   `data-touch-target`; inline prose links and citations retain their line boxes.
3. **Structure (`useLayout`, the size class).** Only when the arrangement itself differs, which is
   every row of the table above. Both shapes take the same props, use the same roles and show the
   same copy; only the kit branches, never a workflow. `useLayout` reads the breakpoint tokens
   emitted by Tailwind, so CSS and React share the thresholds; the gallery supplies its local presentation class. Product may
   use the size class to choose a route or restore a panel; no other file outside the kit reads it
   or queries the viewport, which `tools/layout.test.ts` enforces. There is no phone/desktop boolean.

Responsive presentation is owned by the kit. Conversation state stays in the chat workflow; the
workspace, feed, composer, settings fields, history rows and open search/review/panel contents
keep stable positions in the React tree across viewport changes. Focus and uncontrolled fields survive
rearrangement. Modal surfaces trap focus, Escape dismisses the topmost surface, and closing returns
focus to the opening control or its equivalent in the new arrangement. Navigation closes its menu
when expanding into a sidebar.
Mobile has a brand/status header, icon toolbar, conversation feed, footer navigation,
an always-visible message field with inset microphone and send controls, a separate prompt row, a full-height
agent panel drawer, full-screen search and bottom-drawer navigation. Desktop has the sidebar, reading column, labeled
actions and a side panel. Desktop content uses the full height without a shortcut footer. Search
keeps its shortcut badge; all shortcuts remain available through Search and `?`.
Settings shares Menu's bottom drawer on mobile and centers
as a dialog on desktop; the same feature-named sections rearrange inside it. History uses shared list
compositions. The thresholds live in `styles.css`; React reads the same emitted CSS tokens. The
workspace and full-screen dialogs follow `visualViewport` so a mobile keyboard can reduce their available height.

The private Base UI drawer follows current shadcn's Portal/Backdrop/Viewport/Popup/Content structure.
Compact touch gestures retain scroll-aware drag dismissal. In expanded space the body uses
`data-base-ui-swipe-ignore`, preserving handle-only dragging; centered surfaces hide the handle.
The drawer omits Base UI's opt-in `VirtualKeyboardProvider`, so it does not add body scrolling or
input repositioning. Existing `visualViewport` tokens fit the composer and settings to the available
height, with `body { position: relative; }` for iOS overlays. The user accepted the physical iOS
Safari retest after the preview scrolling and viewport fixes at `1037d86`; see #17. Touch swipe
dismissal is also covered by automated browser checks.
The message field is present before focus and stays one row high while typing. Other feature pages
retain the floating voice action above the footer.

Transcription owns recording admission, OpenAI WebRTC/provider connection, correction ordering,
permissions and resource release. Chat owns applying valid recording revisions to their associated
shared draft, retaining the starting prefix and replacing partial words with corrected final text.
Manual replacement invalidates that association before cancellation; late output cannot replace the
newer draft. The kit presents supplied phase/actions without microphone permissions or credentials.
Connecting offers Cancel, listening offers Finish, and finishing offers Wait. Finish produces text
without Send; Send and Enter use Chat's shared preparation/review policy. Further recordings append
to manual corrections. These logical owners remain independent of the kit's presentation lifetime.
`VoiceStatus` shows capture state and errors above the dock without changing the field's position.
`Composer` shows the Enter arrow while the field has focus and replaces its inset voice/Send action
with Stop during an agent response. Standalone voice controls keep their microphone icon and remain
disabled until the response finishes.
The conversation feed contains submitted messages only. Read-only fields follow incoming words without taking focus. Drafts remain
available when the Chat view closes or switches between a panel and page.

## SettingField interface

`SettingField` declares a field's meaning once and owns its visible label and description. Each
field contains exactly one semantic control: a text-entry `Input`, `Textarea`, `InputGroupInput`,
`InputGroupTextarea`, `RadioGroup` or `ThemeSwitch`. A radio group's choices count as one control.
Ordinary layout helpers and feature components may nest between the field and its control.

```tsx
<SettingField label="Model" description="Used for new messages. Saved on this device.">
  <Input value={model} onChange={(event) => setModel(event.currentTarget.value)} />
</SettingField>
```

The field generates stable identities independently for each instance. An explicit control `id`
is preserved and becomes the label target. The visible field label supplies the accessible name,
and existing `aria-describedby` references compose with the field description without duplicates.
Standalone controls retain their existing names, identities and descriptions. State, persistence
and validation remain with the caller, and the same mounted control survives responsive changes.
Text labels activate their input through native semantics. A choice field uses a visible group
title; its name and description belong to the radio group rather than each choice. `ThemeSwitch`
keeps its own choices and device preference, and retains its Appearance name outside a field.

```tsx
<SettingField label="Theme" description="Choose how Vaulter looks.">
  <ThemeSwitch />
</SettingField>
```

Zero or multiple mounted controls and unsupported control families produce a clear diagnostic.
`Input` supports text, email, password, search, tel and URL entry; other input types need their own
field interface. Unsupported kit controls and semantic control roles or editable props on public
primitives diagnose composition through nested feature components. Raw value controls supplied as
children are rejected; raw controls hidden in an opaque feature component are outside the kit
composition policy. Declare identifiers only on a control
when another reference needs them; field labels and descriptions require no identifier plumbing.

## Composer interface

`Composer` owns the form, one-row textarea, inset actions, keyboard submission and focus-dependent
Send icon. Every Chat and catalogue caller supplies the same controlled interaction:

```tsx
const fieldRef = useRef<HTMLTextAreaElement>(null);
<Composer
  draft={draft}
  onDraftChange={setDraft}
  onSubmit={submitDraft}
  label="Message"
  placeholder="Type a message…"
  canSubmit={!recording}
  busy={responding}
  readOnly={recording}
  voice={{ phase: capturePhase, onClick: toggleCapture }}
  onStop={stopResponse}
  fieldRef={fieldRef}
  onFocusChange={observeFocus}
/>
```

`draft`, `onDraftChange`, `onSubmit`, `label` and `canSubmit` are required. Draft changes report the
complete value; submission reports the current text without clearing or normalizing it. The owner
accepts or rejects submission, opens staged-change review, and clears the draft only when appropriate.
`canSubmit` carries workflow restrictions such as capture. Composer also blocks whitespace-only
text and response-busy submission. Enter and Send use the same form callback once per action.
Shift+Enter, native IME composition and Safari key code 229 keep editing. An ineligible Enter remains
unhandled, so editable fields retain native newline behavior.

Optional `busy` disables the field and microphone and replaces Send with an explicit Stop button;
Enter never invokes Stop. `disabled` and `readOnly` control field editability. `placeholder`,
`sendLabel`, `voice` (phase, click action, optional disabled state), `onStop`, `fieldRef` and
`onFocusChange` support existing adapters without exposing keyboard or icon coordination.
Suggestions remain outside Composer; fill the controlled draft and use `fieldRef` to focus it.
Transcripts update the owner’s draft without focusing the field. Status stays above the anchored dock.
The same textarea survives responsive and preview presentation changes.

Public `SendButton` remains for standalone action-state catalogue coverage. `ComposerActions` has no
remaining callers and is removed; ordinary callers use Composer without assembling forms or actions.
The paired Agent and Agent panel samples retain independent controlled drafts and scripted actions.

## Verifying a kit change

Run `npm run typecheck`, `npm test`, `npm run lint` and `npm run test:ui`. Install Chromium once with
`npx playwright install chromium` (`--with-deps` on Linux CI). The browser suite starts its own sample
server on port 4179 and leaves the design-review server on 4178 running. It uses the public kit fixture
at `tests/browser.html` and the sample preview, with no private vault or paid API.

The suite runs at phone, desktop and touch-desktop sizes. Catalogue coverage checks paired samples,
independent drafts, scoped settings/search/menu portals, component search, CSS and touch density
independent of outer browser size, and no iframe or automatic external service requests. It checks
touch targets, navigation/current state, centered feature columns, feature-named settings drawers, growing action lists, keyboard
tab/checkbox behavior, Escape and focus return, search selection
and drafts through size changes, the mobile field/microphone row before and after focus,
Enter/Shift+Enter/IME, and a simulated visual
viewport resize. The user accepted the physical Safari keyboard/scrolling retest at `1037d86`.
Live microphone capture still needs device validation; the sample preview uses scripted audio.

Fictional Wiki record examples live in `app/preview/`, outside the production catalogue and kit
interface. Both the full preview and independent bounded pairs install real retained nodes, call
`readWiki` and render module-owned `Wiki` UI. Selected evidence and newer/deleted source context
use `PassageCard` and the shared supporting pane. The duplicated provenance prototype and its
Product route are retired; old design links redirect only in the preview bootstrap.

`PresentationPreview` supplies a bounded desktop/mobile canvas for catalogue and module examples.
It owns shared portal, pointer and layout policy, accepts content plus device and height, and does
not interpret records. Generic `DesignPreview` and `DesignComparison` retain device controls,
focused cycling and local state; they supply no record-specific variant context to production.

ToggleGroup presents pressed choices in outlined joined groups at the standard size. Single
selection allows zero or one pressed option; multiple selection allows independent pressed options.
Arrow navigation and disabled/focus feedback follow Base UI, with 44px minimum touch targets.
The catalogue shows both modes. ToggleGroup is distinct from RadioGroup form choices and remains
unsupported inside SettingField; effects belong to the caller.

Browsing Item rows use standard density with plain or muted/current feedback. Group separators,
header/footer context and separate actions remain available. ItemMedia keeps plain/framed icons,
supplied cropped thumbnails and neutral/people/places/events initials through Avatar.
Badge keeps default, secondary and destructive status labels. Named category Chip presentation
uses private secondary badge styling and remains passive or an accessible button when given an
action; decorative dots require a supplied visible label, and callers own counts and state.

MapView uses MapLibre, its bundled worker and OpenFreeMap dark/light styles; Leaflet is retired.
The paired Map example loads external tiles only after Load map, then demonstrates selectable
category markers, solid/dashed routes and compact/section/fill sizes. Changing the map container's
size refits supplied places/routes; selection and theme changes preserve the current camera.
Run real-tile browser acceptance with `VAULTER_MAP_TILES=1 npm run test:ui -- tools/browser/maps.spec.ts`.

Chat owns page and panel task composition, welcome copy and typed record interpretation. The kit
accepts neutral attribution/content in `Message` and supplies the shared feed, dock, toolbar and
supporting pane. All supporting tasks use one 340px expanded pane and full-height compact Drawer;
page toolbars and pane headers share the 48px header token. Touch controls keep their 44px targets.
Chat's direct feed children gain no second scroll owner. The retired `Conversation*` aliases have no
production or catalogue callers. Feed and Supporting feed examples demonstrate neutral values;
actual Chat fictional records remain in the application preview.

Shared prose typography now lives in `prose.css` and is imported by the kit stylesheet. Chat owns
safe text/HAST interpretation and highlighting; its narrow semantic renderer allowance cannot
be used to implement pane layout, custom controls, viewport branches or private kit imports.


`HoverPreview` either presents an explicit supplied anchor/title/text or resolves selected links
through a caller callback. The kit owns the 250ms hover delay, pointer capability, scoped anchor
measurement, leave/scroll/hash dismissal and bounded popup position. The resolver owns link meaning
and supplies retained title/excerpt without exposing a store or workflow to the kit. Independent
bounded specimens obey their own pointer policy and ignore neighboring links.
