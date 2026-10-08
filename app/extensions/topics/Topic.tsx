// One topic: every note tagged with it (or in that area/circle), grouped by type, and the topics that
// most often appear alongside it. Built from tags alone.
import type { Note } from '../notes/model/fields.ts';
import { topicsOf, topicHref, titleOf, excerptOf, facet } from '../notes/model/fields.ts';
import { link } from '../../core/route.ts';
import { NoteLinks } from '../reader/sections.tsx';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge.tsx';
import { PageHeader, Section } from '@/components/layout.tsx';
import { useGraph } from '../graph/use.ts';
import { useSchema } from '../notes/use.ts';

export function Topic({ name }: { name: string }) {
  const v = useGraph();
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
      <PageHeader
        kind="topic"
        title={<span className="capitalize">{name.replace(/-/g, ' ')}</span>}
        lede={
          <>
            {list.length} {list.length === 1 ? 'note' : 'notes'} tagged{' '}
            <code className="rounded-sm bg-surface px-1 py-0.5 font-mono text-sm">{name}</code>
            {areaOf.has(name) ? ' or in this area' : ''}.
          </>
        }
      />
      {related.length > 0 && (
        <div className="-mt-2 mb-8 flex flex-wrap items-center gap-1.5 text-sm text-faint">
          <span className="mr-1">Related</span>
          {related.map((t) => (
            <Badge
              key={t}
              variant="outline"
              asChild={true}
              className="capitalize text-muted-foreground no-underline"
            >
              <a href={link(topicHref(t))}>{t.replace(/-/g, ' ')}</a>
            </Badge>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <Section key={g.label} title={g.label} count={g.items.length}>
          <NoteLinks
            items={g.items.map((n) => {
              const s = facet(n, 'status');
              return {
                note: n,
                badge: !!s && s !== 'done' && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-2 align-text-bottom',
                      s === 'active' ? 'border-success/60 text-success' : 'text-muted-foreground',
                    )}
                  >
                    {s}
                  </Badge>
                ),
                excerpt: excerptOf(n, 150),
              };
            })}
          />
        </Section>
      ))}
    </div>
  );
}
