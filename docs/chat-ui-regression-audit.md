# Chat UI regression audit

Audited `bfd3e009a11dd2091ffee8288a6e13a908af9821` against its parent,
`3ea1aa7595c4e434a6d2c62273874346f4c3f589`, and checked which findings remain in
`6c25daeccd0e0abf1b2106e30a877f7ef27bfe68` (the main branch used for this repair).
The originating spec is [#45](https://github.com/JimLundin/vaulter/issues/45), with
the shared supporting-pane policy from [#44](https://github.com/JimLundin/vaulter/issues/44).

## How Conversations returned

The earlier correction, present in `d86826e`, kept the conversation list beside desktop Chat
and offered an icon-only opener in compact layouts. The parent of the audited commit still
enforced this in `app/ui/kit/conversation.tsx`: the opener rendered only when
`mobile && !!onConversations`.

On October 11, the ownership refactor moved the toolbar into
`app/workflows/chat/ChatSurface.tsx` and rendered the Conversations button unconditionally,
including visible text. Follow-up `84f4c24` then changed the existing desktop browser assertion
in `tools/browser/node-chat.spec.ts` from `toBeHidden()` to `toBeVisible()`. That accepted the
changed behavior instead of protecting the earlier correction.

The repair restores the desktop pane and compact icon arrangement through the kit's existing
`Row visible="compact"` presentation. It applies to the Chat page and supporting Chat pane.

## Standards

| Finding | Evidence | Resolution |
| --- | --- | --- |
| Compact Conversations changed from an icon to a labelled control. | The parent toolbar used `iconOnly={mobile}`; the new `ChatSurface` always included the text. The kit README describes an icon toolbar on mobile. | Restored the icon-only compact opener with accessible name "Conversations". |
| Closing a supporting pane can return focus to the latest background control rather than its original opener. | The refactor changed `tools/browser/framework.spec.ts` to expect "Preference" focused after opening via "Open agent", visiting background focus, and resizing. The kit README says closing returns focus to the opening control or its equivalent. Shared `Drawer` tracks outside focus to support changing evidence openers. | Unresolved policy conflict, not a restored deleted feature. A shared focus change needs to account for Wiki evidence panes as well as Chat. |

No additional defensible code-smell finding was identified in the audited diff. Shared
presentation and module-owned record UI follow ADR 0006.

## Spec

The desktop Conversations opener is the one confirmed restored deleted action. Issue #45
asks Chat to own its task actions and preserve behavior; the existing desktop selection pane
already provides conversation access. The new unconditional opener changed that arrangement.
The later test change made it the expected behavior without preserving the previous correction.
This repair removes the desktop opener and retains compact selection access.

The following controls were checked against the parent; none was restored by this commit:

| Control or content | Audit result |
| --- | --- |
| History toolbar action | Remains removed. |
| New conversation | One action remains; no duplicate was added. |
| Message attribution, model/token metadata, tool disclosure | Existing behavior moved into Chat-owned views. |
| Suggestions, Stop, staged-change review and recovery controls | Existing behavior retained. |

Common pane width, the 768px side-pane transition, 48px headers and simplified welcome typography
are recorded in the migration plan. The bespoke subtitle/back arrow also gave way to the common
pane header. These are shared-presentation changes permitted by #45 rather than restored deleted
actions. This audit does not establish the user's preference for every standardized detail.

A prompt-consumption lifetime weakness around this refactor was subsequently repaired in
`95e42e6` and later Chat lifetime work. It is not a current finding, and this audit does not
attribute its introduction conclusively to `bfd3e00`.

## Additional confirmed regression

The ownership move put an always-mounted `ChatPanel` outside the previous pane visibility
boundary. Its unconditional Suspense fallback could show "Loading conversation…" in the
workspace while Chat was closed. A temporary browser test delayed the Chat module request and
reproduced the closed/open/closed sequence. This remains a follow-up: the requested repair is
limited to Conversations.

## Sign out

Sidebar Sign out was not reintroduced by this commit. Its footer predates the refactor and has
persisted since October 8. The fictional preview passes `signOut: null`, so the authenticated
action does not appear there. Sidebar Sign out is unchanged by this repair.

## Verification

Desktop visibility checks failed before the fix and passed afterward.
Focused checks passed: eight browser scenarios across desktop, phone and touch desktop;
two production browser scenarios across desktop and phone; 25 layout architecture tests;
type checking; lint; and `git diff --check`. Browser assertions cover page/supporting presentation,
bounded previews, compact icon access, chooser dismissal focus, draft retention and resize.
Complete routine verification runs in the pushed commit's Deploy workflow.

Standards: two findings, with the focus-return conflict unresolved. Spec: one finding, the
restored desktop Conversations action, repaired here. The separate closed-pane loading
regression remains a follow-up.
