// A note: its type, facets and tags, the body, and below it what every extension adds (NoteSections);
// the footer links to the source and to each extension's actions on it.
import { useEffect, useState } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import { asList, hrefOf, kind, titleOf, topicHref } from '../../../core/note-fields.ts';
import { dateStr } from '../../../core/format.ts';
import { useHost, NoteSections, NoteActions } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { renderBody, mdxReady, loadMdx } from '../../core/markdown.ts';
import { later } from '../../core/later.ts';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { PageHeader } from '@/components/layout.tsx';

/** The rendered body, in prose. */
export function NoteBody({ note, className }: { note: Note; className?: string }) {
  const { mdx } = useHost();
  const [, setMdx] = useState(mdxReady());
  useEffect(() => {
    if (note.ext === 'mdx' && !mdxReady()) later(loadMdx().then(() => setMdx(true)));
  }, [note.ext]);
  return <article className={cn('note prose', className)}>{renderBody(note, mdx)}</article>;
}

const FACET = /^(area|status|circle)\//;

export function NotePage({ note }: { note: Note }) {
  const { vault: v, source } = useHost();
  const d = note.data;
  const tags = asList(d.tags);
  const type = d.type ? String(d.type) : kind(note.id) === 'daily' ? 'daily' : '';
  const created = dateStr(d.created ?? d.date);
  const upd = v.updated.get(note.id) ?? '';
  const open = asList(d.open);
  // The title is the body's opening "# Title"; a note without one (a day's captures) goes by its name.
  const leadsWithTitle = /^\s*#\s/.test(note.body);
  const name = note.id.split('/').pop()!;
  // One badge per value: an area and a circle can share a name ("work"), and link to the same topic.
  const facets = [
    ...new Map(
      tags
        .filter((t) => FACET.test(t))
        .map((t) => t.split('/'))
        .map(([f, val]) => [val, f] as const),
    ),
  ];
  const meta = (
    <>
      {facets.map(([val, f]) =>
        f === 'status' ? (
          <Badge
            key={val}
            variant="outline"
            className={cn(
              'capitalize',
              val === 'active' ? 'border-success/60 text-success' : 'text-muted-foreground',
            )}
          >
            {val.replace('-', ' ')}
          </Badge>
        ) : (
          <Badge
            key={val}
            variant="outline"
            asChild={true}
            className="text-muted-foreground no-underline"
          >
            <a href={link(topicHref(val))}>{val.replace('-', ' ')}</a>
          </Badge>
        ),
      )}
      {tags
        .filter((t) => !FACET.test(t))
        .map((t) => (
          <a
            key={t}
            href={link(topicHref(t))}
            className="text-faint no-underline hover:text-primary"
          >
            #{t}
          </a>
        ))}
      {!!created && <span className="tabular-nums">{created}</span>}
      {!!upd && upd !== created && <span className="tabular-nums">updated {upd}</span>}
      {open.length > 0 && (
        <a
          href={link(`${hrefOf(note)}#open-questions`)}
          className="font-medium text-destructive no-underline hover:underline"
        >
          {open.length} open {open.length === 1 ? 'question' : 'questions'}
        </a>
      )}
    </>
  );
  return (
    <div className="v-note">
      <PageHeader
        kind={type || undefined}
        meta={meta}
        title={leadsWithTitle ? titleOf(note) : name}
      />
      {/* The body's own leading "# Title" is the header's title. */}
      <NoteBody note={note} className="[&>h1:first-child]:hidden [&>h1:first-child+*]:mt-0" />
      <div className="mt-12 empty:hidden">
        <NoteSections note={note} />
      </div>
      <Separator className="mt-12" />
      <footer className="mt-3 text-xs text-faint [&_a]:text-faint [&_a]:no-underline [&_a:hover]:text-primary">
        {source ? <a href={source(note.path)}>{note.path}</a> : note.path}
        <NoteActions note={note} />
      </footer>
    </div>
  );
}
