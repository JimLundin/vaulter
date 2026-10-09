# Unified input button prototype

Throwaway interaction preview based on reconciled `structure` at `d97f191`.

Run `npm run design -- --port 5181`, then open <http://localhost:5181/preview/?variant=A>.
In this worktree, use `--config /tmp/vaulter-input-preview.vite.config.mts` so Vite
can serve fonts from the shared `node_modules` directory.
Use the existing Mobile toggle to check the phone layout. Dictation is scripted.

The arrow switcher follows the merged UI prototype's pattern and sits inside the
preview bar alongside the device controls. It cycles
the `variant` query parameter without resetting drafts or active transcription.
Left/right keys switch options outside text fields.

The user requested matching light treatments for microphone and Enter and a visual
comparison before choosing. Three variants use existing kit colors and shapes:

- A: white background, black icon, subtle outline. This is the default.
- B: black background, white icon, filled button.
- C: white background, black icon, no outline.

Colors follow the kit's theme. All states share the selected treatment; disabled
Enter is faded. The comparison is limited to the requested button styling.

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
The three variants also pass mouse/touch checks for URL selection, draft
preservation, transcription during switches, and unchanged composer geometry.

Awaiting user review before applying the behavior to `structure`. Production work
should update the shared Composer and its browser acceptance checks, then update
the README's description of the controls.

The preview includes the remaining `design-variants` mobile polish, expandable
tool summaries and Home Screen support, while preserving structure's Base UI
presentation components. The sidebar active-attribute correction remains here.
