# Input button preview variants

`npm run design` opens `/preview/?variant=A`. The picker sits inside the preview
bar beside Window, Desktop and Mobile. It preserves drafts and recording while
switching between A (white with a subtle border), B (black filled) and C (white
without a border). Colors follow the selected appearance.

In DesignPreview, the composer has one action: microphone when the field is
unfocused, including with a draft; Enter while focused, disabled for empty or
whitespace-only text. Recording uses finish/cancel, and an agent response uses
Stop. Pointer submission retains field focus so it sends once.

These choices apply only to design previews. The real app and ordinary catalogue
samples keep their current composer controls pending a design choice. The original
experiment is preserved on `prototype/unified-input-button` at `26eddbb`.

Left/right arrows switch variants outside editable fields and controls that own
arrow-key navigation. The URL makes each variant shareable and reload-stable.
