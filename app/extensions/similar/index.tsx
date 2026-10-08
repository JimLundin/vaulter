// Similar, not yet linked: under a note, the notes most alike in text that nothing connects yet
// (app/extensions/similar/similar.ts, computed in the worker).
import type { Note } from '../notes/model/fields.ts';
import { excerptOf, kind } from '../notes/model/fields.ts';
import type { Extension } from '../../core/extension.ts';
import { perGraph } from '../graph/model/graph.ts';
import { isTopical } from '../notes/model/fields.ts';
import { NoteLinks } from '../reader/sections.tsx';
import { noteSections } from '../reader/slots.tsx';
import { Section } from '@/components/layout.tsx';
import { useGraph } from '../graph/use.ts';
import { similarNotes } from './similar.ts';

/** Each topical note's most alike, once per graph (similar.ts). */
const similarOf = perGraph((v) => similarNotes(v.notes.filter(isTopical), v.backlinks, v.graph));

function Similar({ note }: { note: Note }) {
  const v = useGraph();
  const similar = similarOf(v);
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
