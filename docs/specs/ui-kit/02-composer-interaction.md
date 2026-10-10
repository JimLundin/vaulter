# Deepen Composer interaction

## Problem Statement

Message entry is assembled separately by the real Chat view and live catalogue examples. Callers
coordinate the form, textarea shape, focus presentation, keyboard submission and inset actions.
The product protects Safari IME confirmation and submits through the form; one catalogue example
omits that protection and sends directly. Another panel example has different keyboard handling.

Users need predictable message entry across desktop, mobile, panels and previews. Maintainers need
one place to change its interaction behavior without risking differences between callers.

## Solution

Make Composer own shared message-entry interaction and arrangement. Product and catalogue adapters
supply drafts and actions to the same implementation. Enter and Send follow one submission path;
IME confirmation and Shift+Enter remain editing actions. The workflow retains conversation state,
dictation, review and response cancellation.

## User Stories

1. As an agent user, I want Enter to submit my draft, so that keyboard message entry is fast.
2. As an agent user, I want Shift+Enter to insert a newline, so that I can write a multiline message.
3. As an IME user, I want Enter confirming composed text to keep editing, so that I do not send an unfinished message.
4. As an IME user, I want Safari composition confirmation protected, so that message entry is reliable across browsers.
5. As an agent user, I want Send and Enter to follow the same review path, so that staged changes are handled consistently.
6. As an agent user, I want empty and whitespace-only drafts left unsent, so that accidental submission creates no turn.
7. As an agent user, I want a single-row composer that scrolls long text, so that my feed and actions stay anchored.
8. As an agent user, I want inset actions to leave room for text, so that my draft remains readable.
9. As a touch user, I want reachable microphone and Send targets, so that I can act without precise pointing.
10. As a keyboard user, I want the send icon to reflect field focus, so that the available submission action is clear.
11. As an agent user, I want the response action to become Stop while busy, so that I can interrupt a response.
12. As an agent user, I want Enter during a response to avoid sending or stopping, so that editing shortcuts do not cancel work.
13. As a voice user, I want dictation to update the same draft as typing, so that I can edit speech before sending.
14. As a voice user, I want recording states to prevent premature submission, so that partial speech stays a draft.
15. As a voice user, I want incoming transcript text to avoid taking keyboard focus, so that dictation does not summon the phone keyboard.
16. As a voice user, I want failed or interrupted capture to preserve words, so that I can correct or submit them later.
17. As an agent user, I want suggestions to fill and focus the draft, so that I can edit a suggested prompt before submission.
18. As an agent user, I want suggestions outside the message field, so that they do not compete with inset actions.
19. As an agent user, I want voice status above the anchored composer, so that status changes do not move the field.
20. As an agent user, I want resizing to preserve my field, focus and draft, so that changing arrangements does not interrupt writing.
21. As an agent user, I want closing and reopening the view to preserve the shared draft, so that unfinished messages remain available.
22. As a design reviewer, I want previews to use the same entry behavior as the product, so that the catalogue demonstrates actual behavior.
23. As a design reviewer, I want paired samples to keep independent drafts, so that I can compare both arrangements directly.
24. As a workflow developer, I want to supply draft and action callbacks without implementing keyboard rules, so that the Composer interface gives useful leverage.
25. As a workflow developer, I want focus observation and an imperative field reference available where needed, so that existing suggestion and prompt behavior remains possible.
26. As a kit maintainer, I want one interaction implementation, so that fixes have locality across every Composer caller.

## Implementation Decisions

- Deepen the public Composer module using existing form, input-group, textarea, button and layout
  primitives. It owns their common assembly, keyboard handling and focus-dependent presentation.
- The primary interface accepts a controlled draft, a draft-change action and a submit action for
  the current text, plus the existing field label, placeholder, response state, editability and
  submission-permission information. Optional voice and Stop actions remain explicit inputs.
- Retain field-reference and focus-observation support needed by prompt selection and suggestion
  visibility. Composer owns the send icon's focus behavior; workflows may observe focus for their
  own behavior without reconstructing the presentation rule.
- Enter without Shift submits through the same form path as Send only when neither native IME
  composition nor Safari key code 229 is active. Shift+Enter and either IME confirmation remain
  editing events. Prevent the default Enter newline only for a handled submission action.
- Invoke the workflow's submit callback at most once per handled submission. Do not call a
  conversation send operation directly from Composer or use a different catalogue shortcut.
- Common submission eligibility requires non-whitespace text, caller permission and an idle
  response state. The workflow supplies permission for recording and any other task-specific
  restrictions, and retains its authoritative checks at the action callback.
- While a response is busy, the field retains its current disabled behavior and the response action
  becomes a button invoking Stop. Enter does not invoke Stop. The microphone retains its current
  disabled response behavior and distinct capture action.
- Connecting, listening and finishing capture retain the existing read-only field and blocked
  submission behavior. Composer receives those presentation facts; the workflow owns their meaning.
- Changing the draft reports the complete value to its owner. Composer does not persist, clear,
  append, reconcile or submit transcripts itself. A rejected or review-pending submission must
  not erase the controlled draft.
- Keep one stable textarea through responsive rearrangement and preview device changes. Use the
  existing one-row size, internal scrolling, measured inset action space and pointer-density roles.
- Keep suggestions outside Composer and status above the dock. Their workflow generation,
  visibility and actions remain separate from Composer's interaction implementation.
- Migrate every current product and catalogue Composer caller together. Catalogue adapters own
  independent sample drafts and scripted actions; they use the shared interaction implementation.
- Retain ComposerActions, SendButton and other public presentation only where current callers or
  catalogue coverage still need them. They may compose private implementation but must not require
  ordinary Composer callers to repeat form, focus or keyboard coordination.
- Preserve no-styling public presentation and public paired examples. Private helper extraction
  uses composition verification from the preceding spec.
- The current shallow assembly has little depth under the deletion test: deleting it leaves
  coordination with callers. Absorbing that coordination creates leverage and locality without
  moving conversation lifetime into the kit.

## Testing Decisions

- The user confirmed the public Composer as the primary seam. Test browser-visible behavior using
  real form and control interactions; do not expose or separately certify a keyboard predicate.
- Use a controlled public-kit fixture with draft and submit callbacks to verify value changes,
  callback counts, blocked submissions, review-pending drafts, optional actions and focus behavior.
- Exercise the same requirements through the real Chat view and paired catalogue adapters. Keep
  workflow integration checks for staging review, Stop, dictation and shared draft lifetime.
- Cover Enter, Shift+Enter, native composition, Safari key code 229, whitespace, response-busy
  state and capture states. Require the formerly divergent catalogue path to pass IME checks.
- Assert text, accessible names, action behavior, focus and rendered geometry. Field identity across
  rearrangement is a documented requirement; private helper names and internal state are not.
- Retain existing browser prior art for the one-row field, inset controls, focus-dependent icon,
  paired drafts, transcription, visual viewport and responsive preservation.
- Keep physical keyboard and microphone validation identified separately from synthetic IME and
  viewport checks. No paid model or real microphone is needed for automated acceptance.
- Run typecheck, the full Vitest suite, lint and browser checks across phone, desktop and
  touch-desktop, followed by product and design builds.
- Completion requires every current Composer caller to use the shared interaction implementation,
  pass the listed behaviors and stop repeating keyboard and send-icon focus coordination.

## Out of Scope

Changing conversation lifetime, draft persistence, capture transport, transcript reconciliation,
suggestion generation, model selection, staged-change review or vault writes. A new chat framework,
multiline-growing composer, alternative mobile design and global focus manager are not part of
this spec. Field association and overlay policy are separate specs.

## Further Notes

This is second in the migration sequence and has the strongest immediate payoff. Complete private
composition verification first if the implementation uses extracted private composition helpers.

At reviewed commit `61769fa`, selected product IME and catalogue entry tests passed. The catalogue
IME divergence is confirmed in source but is not covered by those existing checks. This spec closes
that gap rather than treating the prior passing suite as proof of identical behavior.
