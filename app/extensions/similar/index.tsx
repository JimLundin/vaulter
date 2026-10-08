// Similar, not yet linked: under a note, the notes most alike in text that nothing connects yet
// (app/extensions/similar/similar.ts, computed in the worker).
import type { Note } from '../notes/model/fields.ts';
import { excerptOf, kind } from '../notes/model/fields.ts';
import type { Extension } from '../../core/extension.ts';
import { useHeavy, useVault } from '../../core/host.tsx';
import { NoteLinks } from '../notes/sections.tsx';
import { noteSections } from '../notes/slots.tsx';
import { Section } from '@/components/layout.tsx';

function Similar({ note }: { note: Note }) {
  const v = useVault();
  const similar = useHeavy('similar');
  const alike =
    kind(note.id) === 'note'
      ? (similar?.[note.id] ?? []).map((x) => v.byId.get(x.id)).filter((n) => n !== undefined)
      : [];
  if (!alike.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#similar); useId would break it
    <Section title="Similar, not yet linked" id="similar" count={alike.length}>
      <NoteLinks items={alike.map((n) => ({ note: n, excerpt: excerptOf(n, 160) }))} />
    </Section>
  );
}

export const similar: Extension = {
  id: 'similar',
  contributes: [noteSections.add({ order: 90, view: Similar })],
};
