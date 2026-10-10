# Unified input button

The composer uses one action across Product, the design preview and catalogue.
Microphone and Enter are primary actions and use the same shared `filled` style,
standard 44px icon-only layout and 8px corners. Colors follow the selected appearance,
matching New chat, Open vault and confirmation actions.

When the field loses focus, the action switches to microphone even with a draft.
While focused, it shows Enter, disabled for empty or whitespace-only text or when
submission is denied. Pointer submission retains field focus and submits once.
Recording uses finish/cancel while preserving the draft. During an agent response,
only the supporting outlined Stop action is shown. A composer without voice retains
its submission action in both focus states.

`npm run design` opens `/preview/`. The preview bar contains Window, Desktop and
Mobile choices, the kit link and reset; the completed A/B/C input-style experiment
and its keyboard shortcut have been removed. Old variant URLs show the shared style.
The original experiment remains in Git history on `prototype/unified-input-button`
at `26eddbb`.

On phones, device choices use a native selector in a single touch row and the kit
and reset actions use icons. The full sample-data notice remains available to
assistive technology. The preview fits the visible browser viewport and follows
Safari's viewport panning, while scrolling stays inside the app content.
