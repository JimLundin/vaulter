// Similar, not yet linked: under a note, the notes most alike in text that nothing connects yet
// (core/similar.ts, computed in the worker).
import type { Note } from '../../../core/note-fields.ts';
import { excerptOf, kind } from '../../../core/note-fields.ts';
import type { Extension } from '../../core/extension.ts';
import { useHeavy, useVault } from '../../core/host.tsx';
import { NoteLinks } from '../notes/sections.tsx';
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
    <Section title="Similar, not yet linked">
      <NoteLinks items={alike.map((n) => ({ note: n, excerpt: excerptOf(n, 160) }))} />
    </Section>
  );
}

export const similar: Extension = { id: 'similar', noteSections: [{ order: 90, view: Similar }] };
