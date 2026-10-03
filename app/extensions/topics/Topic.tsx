// One topic: every note tagged with it (or in that area/circle), grouped by type, and the topics that
// most often appear alongside it. Built from tags alone.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import {
  topicsOf,
  topicHref,
  titleOf,
  excerptOf,
  hrefOf,
  facet,
} from '../../../core/note-fields.ts';
import { useSchema, useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './topic.css';

export function Topic({ name }: { name: string }) {
  const v = useVault();
  const { areaOf, types, statusRank } = useSchema();
  const list = v.topics.get(name) ?? [];
  const { degree } = v.signals;
  const order = (a: Note, b: Note) =>
    statusRank(facet(a, 'status')) - statusRank(facet(b, 'status')) ||
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
    titleOf(a).localeCompare(titleOf(b));
  const known = new Set(types.map((t) => t.key));
  const groups = [...types, { key: '', label: 'Other' }]
    .map((t) => ({
      label: t.label,
      items: list
        .filter((n) => (t.key ? n.data.type === t.key : !known.has(n.data.type)))
        .sort(order),
    }))
    .filter((g) => g.items.length);
  // Related: topics that co-occur on these notes, weighted by how specific they are to this topic.
  const co = new Map<string, number>();
  for (const n of list)
    for (const t of topicsOf(n)) if (t !== name) co.set(t, (co.get(t) ?? 0) + 1);
  const related = [...co]
    .filter(([, c]) => c >= 2 || list.length < 4)
    .sort(
      (a, b) =>
        b[1] / Math.sqrt(v.topics.get(b[0])!.length) - a[1] / Math.sqrt(v.topics.get(a[0])!.length),
    )
    .slice(0, 10)
    .map(([t]) => t);

  return (
    <div className="v-topic">
      <div className="meta">
        <span className="chip">topic</span>
      </div>
      <h1>{name.replace(/-/g, ' ')}</h1>
      <p className="lede">
        {list.length} {list.length === 1 ? 'note' : 'notes'} tagged <code>{name}</code>
        {areaOf.has(name) ? ' or in this area' : ''}.
      </p>
      {related.length > 0 && (
        <p className="related">
          Related:{' '}
          {related.map((t, i) => (
            <Fragment key={t}>
              {i > 0 && ' · '}
              <a href={link(topicHref(t))}>{t.replace(/-/g, ' ')}</a>
            </Fragment>
          ))}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.label} className="tgroup">
          <h2>
            {g.label} <span>{g.items.length}</span>
          </h2>
          <ul className="notelist">
            {g.items.map((n) => {
              const s = facet(n, 'status');
              const ex = excerptOf(n, 150);
              return (
                <li key={n.id}>
                  <a href={link(hrefOf(n))}>{titleOf(n)}</a>
                  {!!s && s !== 'done' && <em className={`st st-${s}`}>{s}</em>}
                  {!!ex && <span> — {ex}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
