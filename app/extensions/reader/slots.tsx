// The place on a note's page that other features fill: the sections under its body. A feature that adds
// to a note imports it; the reader knows none of them.
import type { ComponentType } from 'react';
import type { Note } from '../notes/model/fields.ts';
import { useHost } from '../../core/host.tsx';
import { slot } from '../../core/slot.ts';

/** Sections under a note's body, by `order`; a section renders null when it has nothing to show. */
export const noteSections = slot<{ order: number; view: ComponentType<{ note: Note }> }>(
  'notes.sections',
);

export function NoteSections({ note }: { note: Note }) {
  const { extensions } = useHost();
  return (
    <>
      {noteSections
        .of(extensions)
        .sort((a, b) => a.entry.order - b.entry.order)
        .map(({ from, entry: { view: View, order } }) => (
          <View key={`${from}.${order}`} note={note} />
        ))}
    </>
  );
}
