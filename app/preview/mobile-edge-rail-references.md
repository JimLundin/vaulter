# Mobile edge rail: references and input clearance

Researched 2026-10-14 for the `prototype/mobile-bottom-bar` worktree.

The selected direction is a freestanding one- or two-button **edge rail** that opens the
application's Modules and Tools lists. Expandable puck and Thumb cluster are rejected. The
remaining problem is that a rail parked low on the screen can cover Chat's text-field action
before the field receives focus.

Samsung Edge panels is the closest visual precedent. Android's floating accessibility menu is
the strongest implementation precedent: it preserves a preferred position while temporarily
resolving a keyboard-safe position. Neither source establishes automatic avoidance of Vaulter's
visible text-field controls; that needs a shared presentation rule.

The user's subsequent direction supersedes the collision proposal below: fix the rail in the
lower-right of the visible viewport and place shared text inputs to its left. The current
comparison is `?navigation=edge&variant=corner-split`; see
[the prototype record](mobile-bottom-bar-prototype.md#current-comparison-fixed-lower-right-edge-bars).
Samsung remains the visual reference for a small edge control opening growing lists, and
Material supports reachable, independent lower-right geometry. The reserved input lane is
Vaulter's prototype decision; these sources do not establish it as their own input behavior.
The earlier AOSP-inspired recommendation is retained below as research history.

## Verified primary references

| Reference | Verified behavior | What applies here |
| --- | --- | --- |
| [Samsung: How do I use the edge panel?](https://www.samsung.com/uk/support/mobile-devices/what-is-the-edge-panel-and-how-do-i-use-it/) | A narrow edge handle opens panels over the current app. Apps and Tasks are separate panels. Handle settings choose Left/Right, vertical position, position lock, colour, size and transparency. | Keep the permanent rail small; put the growing module list in an expanded panel. Let the user choose edge and comfortable height. This is an overlay owned independently of the underlying app. |
| [Apple: Use AssistiveTouch on iPhone](https://support.apple.com/guide/iphone/use-assistivetouch-iph96b21954/ios) | A floating menu button can be dragged to a new location. A tap opens actions; a tap outside dismisses the menu. The top-level menu is customizable, with up to eight icons, and Idle Opacity adjusts the button's visibility when unused. | Stable application control with explicit expansion, outside dismissal and user placement. The reference is its behavior, rather than its round launcher or radial menu. |
| [Google: Use accessibility shortcuts](https://support.google.com/accessibility/android/answer/7650693?hl=en) | The floating accessibility button can be dragged and dropped. Dragging it toward an edge makes it smaller. Settings control size and idle transparency. It can float over other apps. | Edge docking and manual repositioning are established ways to reduce obstruction. Fading reduces visual prominence; it does not free an underlying button's touch target. |
| [AOSP: floating accessibility menu position](https://github.com/aosp-mirror/platform_frameworks_base/blob/ee50b5d7ca06905647233418881336aac1e67e5e/packages/SystemUI/src/com/android/systemui/accessibility/floatingmenu/MenuViewAppearance.java#L170-L186) | `getMenuPosition()` computes a preferred position from saved percentages of the available bounds, excluding the keyboard. If the menu's bottom overlaps the visible keyboard, it substitutes an upward position. Its extra keyboard shifting space is explicitly described as reducing overlap with the primary action button near the bottom. | Separate the user's chosen placement from a temporary safe rendered placement. Apply the smallest necessary adjustment, keep the chosen edge, and recover the preferred position when the obstruction disappears. |
| [Material 3: FAB guidelines](https://m3.material.io/components/floating-action-button/guidelines) | For compact and medium windows, the lower-right placement is described as easy to reach and less likely to cover important content. FABs stay above scrolling content and move separately from the content surface. The component represents a screen's primary action; Material advises against using it for overflow actions. | Evidence for reachable, independent floating geometry. A global Modules/Tools rail has different semantics from a FAB. The cited page does not specify keyboard or composer collision avoidance. |
| [Android Developers: Set up window insets](https://developer.android.com/develop/ui/compose/system/insets-ui) | Insets ensure interactive elements avoid system UI; layout follows keyboard inset changes. Keyboard padding applies no space when the keyboard is closed. Nested consumers avoid applying the same inset twice. The guide demonstrates keeping a final text field above the keyboard. | Shared ownership of available geometry, temporary clearance and avoiding duplicated blank space. This concerns system/keyboard obstruction; app-overlay clearance is a separate rule. |

Samsung's linked article was updated in December 2020 and uses an older Galaxy UI. Apple's
[additional support article](https://support.apple.com/en-us/111794) explicitly confirms that the
button can be dragged to any screen edge and stays there until moved. The AOSP link is pinned to
commit `ee50b5d7ca06905647233418881336aac1e67e5e`; it establishes source behavior, not a physical
device test across Android versions. Material 2 was also checked, but is retired; use Material 3
for current guidance.

## First-party visual examples

These illustrations are supplied by the linked support articles. They demonstrate the resting
handle, expanded panel and placement controls; they do not demonstrate keyboard avoidance.

| Samsung: resting edge handle | Samsung: expanded Apps panel | Samsung: handle placement |
| --- | --- | --- |
| <img src="https://images.samsung.com/is/image/samsung/assets/uk/support/lucidcx/howdoiusetheedgepanel7.png?$ORIGIN_PNG$" alt="Samsung screenshot with a small handle at the right edge" width="180" /> | <img src="https://images.samsung.com/is/image/samsung/assets/uk/support/lucidcx/howdoiusetheedgepanel8.png?$ORIGIN_PNG$" alt="Samsung screenshot with the Apps edge panel open" width="180" /> | <img src="https://images.samsung.com/is/image/samsung/assets/uk/support/lucidcx/howdoiusethepeopleedgepanel45.png?$ORIGIN_PNG$" alt="Samsung Handle settings showing edge, position lock, transparency and size" width="180" /> |

Apple also supplies [a resting AssistiveTouch example](https://cdsassets.apple.com/live/7WUAS350/images/ios/ios13-iphone-xs-home-assistive-touch.png)
and [an expanded menu example](https://cdsassets.apple.com/live/7WUAS350/images/ios/ios13-iphone-xs-home-assistive-touch-menu.png).
These screenshots were downloaded and visually checked during research. Keep them as cited
references rather than copied application assets.

## Earlier proposal for Vaulter

This section is a design recommendation inferred from the references and the selected direction.
It is not a claim that Samsung or Apple implements these rules.

1. **Retain one or two rail buttons.** Modules opens the sidebar-style module list; Tools opens
   the application actions. The lists expand inward beside the chosen edge, with scrolling when
   the visible viewport cannot contain them. No permanent row of module shortcuts is needed.
2. **Keep preferred placement separate from safe placement.** Retain the user's edge and height
   across modules. Permit bottom alignment when there is room. Keyboard, safe-area and protected
   input geometry constrain only the rendered position; they do not overwrite the preference.
3. **Protect the whole visible input surface before focus.** Its text field and inset voice,
   Send, Enter or other primary action form one protected region. Compute the region's actual
   bounds, including its hit targets. A focus-only lift misses the moment when a user needs to
   tap the microphone or focus the field. A fixed clearance misses changes in input height.
4. **Resolve collisions in shared presentation.** The common input component declares its
   protected bounds to the kit's presentation policy. The app-level rail chooses the closest
   non-overlapping position along its current edge, with a small gap. The rail stays outside the
   module's tree and scroll container. No route test, Chat-specific selector or Questions-specific
   positioning is needed. This follows [ADR 0006](../../docs/adr/0006-module-ui-and-shared-presentation.md),
   which assigns geometry and interaction mechanics to the kit while modules own their tasks.
5. **Adjust only on actual overlap.** A middle-of-page field need not move a distant rail. A
   full-width bottom input naturally moves an overlapping rail just above that input. When the
   input disappears or the viewport expands, return toward the preferred bottom position. User
   dragging must also respect protected input targets, so the conflict cannot be recreated.

The strongest combination is **Samsung's minimal edge handle and expanded lists, with AOSP's
preferred-versus-resolved placement model**, extended by a shared input exclusion region.
Freestanding ownership remains intact while the rail participates in the application's shared
geometry policy.

Idle transparency and a narrower visual shell can improve appearance, but neither solves touch
obstruction. Moving the rail manually is useful customization; it should not be required to send
a message. A global permanent bottom floor would also lose the requested bottom alignment on
pages with no input.

## Checks for the earlier clearance iteration

- Verify the entire input/action hit region stays clear before focus, with a draft, during voice
  input and while sending; repeat on either edge and with one- and two-button rails.
- Vary input height, phone width, safe areas and the visual viewport during keyboard resize/pan.
  Confirm the nearest safe placement, restored preference and retained draft/focus.
- Navigate among Chat, Questions and other modules. Placement and rail controls must retain the
  same owner; module-specific input content must use the same presentation contract.
- Confirm expanded lists fit and scroll, retain current-module markers, dismiss predictably and
  preserve usable focus. Use physical phones to assess reach and actual keyboards; emulation
  alone cannot establish thumb ergonomics.

This note adds references and a proposal only. It does not promote the prototype or implement the
shared input component.
