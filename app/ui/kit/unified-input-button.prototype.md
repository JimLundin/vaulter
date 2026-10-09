# Unified input button prototype

Throwaway interaction preview based on `structure` at `9e7f4d6`.

Run `npm run design -- --port 5181`, then open <http://localhost:5181/preview/>.
Use the existing Mobile toggle to check the phone layout. Dictation is scripted.

The question: does one inset action feel right when microphone and submission
share the same position?

- An unfocused field shows the microphone, including when a draft exists.
- A focused field shows Enter, disabled for an empty or whitespace-only draft.
- A focused field with text enables Enter.
- Pointer activation of Enter retains field focus so the action submits once.
- Connecting, listening and finishing use the existing voice action.
- Finishing dictation leaves the field unfocused; tap the field to edit or send.
- An agent response replaces the action with Stop. Ending a response resets focus
  observation so an inactive field returns to the microphone.

The existing draft lifetime, submission, IME handling and transcription callbacks
remain in use. The layout reserves space for one inset button.

Validated with Chromium on desktop and touch phone: state transitions, retained
drafts on blur, speech appending, no focus during speech, one submission per mouse
or touch activation, and one button throughout recording and agent responses.
TypeScript and the changed file's Biome check pass.

Awaiting user review before applying the behavior to `structure`. Production work
should update the shared Composer and its browser acceptance checks, then update
the README's description of the controls.
