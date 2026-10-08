// The places on a note's page that other features fill: the sections under its body, and the links in
// its footer. A feature that adds to a note imports these; notes knows none of them.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import type { ComponentType } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import { type Host, useHost } from '../../shell/host.tsx';
import { link } from '../../shell/route.ts';
import { slot } from '../../shell/slot.ts';

/** Sections under a note's body, by `order`; a section renders null when it has nothing to show. */
export const noteSections = slot<{ order: number; view: ComponentType<{ note: Note }> }>(
  'notes.sections',
);

/** Links in a note's footer ("edit"), shown when `when` says they apply. */
export const noteActions = slot<{
  label: string;
  href: (note: Note) => string;
  when?: (host: Host) => boolean;
}>('notes.actions');

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

export function NoteActions({ note }: { note: Note }) {
  const host = useHost();
  return (
    <>
      {noteActions
        .of(host.extensions)
        .filter(({ entry }) => !entry.when || entry.when(host))
        .map(({ entry }) => (
          <Fragment key={entry.label}>
            {' '}
            · <a href={link(entry.href(note))}>{entry.label}</a>
          </Fragment>
        ))}
    </>
  );
}
