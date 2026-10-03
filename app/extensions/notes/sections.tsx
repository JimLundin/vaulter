// What a note states about itself, under its body: open questions, follow-ups, connections (relations
// both ways), and the notes linking to it.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import { titleOf, hrefOf } from '../../../core/note-fields.ts';
import { followUpsOf, openOf } from '../../../core/facts.ts';
import { fmtDay } from '../../../core/format.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';

export const to = (n: Note) => link(hrefOf(n));

export function OpenQuestions({ note }: { note: Note }) {
  const open = openOf(note);
  if (note.id === 'Home' || !open.length) return null;
  return (
    <section className="sect open">
      {/* biome-ignore lint/correctness/useUniqueElementIds: the fragment target NotePage links to (#open-questions); useId would break it */}
      <h2 id="open-questions">Open questions</h2>
      <ul>
        {open.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </section>
  );
}

export function FollowUps({ note }: { note: Note }) {
  const fu = followUpsOf(note, useVault().byId);
  if (!fu.length) return null;
  return (
    <section className="sect">
      {/* biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#follow-ups); useId would break it */}
      <h2 id="follow-ups">Follow-ups</h2>
      <ul className="dates">
        {fu.map((f) => (
          <li key={`${f.by}|${f.what}`} className={f.due ? 'due' : ''}>
            <time>{f.by ? fmtDay(f.by) : 'no date'}</time>
            {f.what}
            {f.who ? (
              <>
                {' '}
                · <a href={to(f.who)}>{titleOf(f.who)}</a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Connections({ note }: { note: Note }) {
  const edges = useVault().graph.get(note.id) ?? [];
  if (!edges.length) return null;
  return (
    <section className="sect">
      <h2>Connections</h2>
      <dl className="edges">
        {edges.map((e) => (
          <div key={e.label}>
            <dt>{e.label}</dt>
            <dd>
              {e.notes.map((n, i) => (
                <Fragment key={n.id}>
                  {i > 0 && ', '}
                  <a href={to(n)}>{titleOf(n)}</a>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LinkedFrom({ note }: { note: Note }) {
  const inbound = useVault().backlinks.get(note.id) ?? [];
  if (note.id === 'Home' || !inbound.length) return null;
  return (
    <section className="sect backlinks">
      <h2>
        Linked from <span>{inbound.length}</span>
      </h2>
      <ul>
        {inbound.map((b) => (
          <li key={`${b.from.id}|${b.context}`}>
            <a href={to(b.from)}>{titleOf(b.from)}</a>
            {!!b.context && <p>{b.context}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
