// Similar, not yet linked: under a note, the notes most alike in text that nothing connects yet
// (core/similar.ts, computed in the worker).
import type { Note } from '../../../core/note-fields.ts';
import { titleOf, excerptOf, kind } from '../../../core/note-fields.ts';
import type { Extension } from '../../core/extension.ts';
import { useHeavy, useVault } from '../../core/host.tsx';
import { to } from '../notes/sections.tsx';

function Similar({ note }: { note: Note }) {
  const v = useVault();
  const similar = useHeavy('similar');
  const alike =
    kind(note.id) === 'note'
      ? (similar?.[note.id] ?? []).map((x) => v.byId.get(x.id)).filter((n) => n !== undefined)
      : [];
  if (!alike.length) return null;
  return (
    <section className="sect backlinks">
      <h2>Similar, not yet linked</h2>
      <ul>
        {alike.map((n) => (
          <li key={n.id}>
            <a href={to(n)}>{titleOf(n)}</a>
            <p>{excerptOf(n, 160)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const similar: Extension = { id: 'similar', noteSections: [{ order: 90, view: Similar }] };
