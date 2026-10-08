// A note: its type, facets and tags, the body, and below it what every extension adds (NoteSections, slots.tsx);
// the footer links to the source and to each extension's actions on it. Where the page is wide enough,
// a rail beside the body (Rail.tsx) has the headings, the properties and the sections below.
import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import { asList, hrefOf, kind, titleOf, topicHref } from '../../../core/note-fields.ts';
import { dateStr } from '../../../core/format.ts';
import { useHost } from '../../shell/host.tsx';
import { NoteActions, NoteSections } from './slots.tsx';
import { link } from '../../shell/route.ts';
import { renderBody, mdxReady, loadMdx } from '../../shell/markdown.ts';
import { later } from '../../shell/later.ts';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge.tsx';
import { Separator } from '@/components/ui/separator.tsx';
import { PageHeader } from '@/components/layout.tsx';
import { Jumps, OnThisPage, RailGroup, Toc, useHeadings, useJumps } from './Rail.tsx';

/** The rendered body, in prose. */
export function NoteBody({
  note,
  className,
  ref,
}: {
  note: Note;
  className?: string;
  ref?: Ref<HTMLElement>;
}) {
  const { mdx } = useHost();
  const [, setMdx] = useState(mdxReady());
  useEffect(() => {
    if (note.ext === 'mdx' && !mdxReady()) later(loadMdx().then(() => setMdx(true)));
  }, [note.ext]);
  return (
    <article ref={ref} className={cn('note prose', className)}>
      {renderBody(note, mdx)}
    </article>
  );
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
  const href = hrefOf(note);
  const [more, setMore] = useState(false);
  const article = useRef<HTMLElement>(null);
  const below = useRef<HTMLDivElement>(null);
  const headings = useHeadings(article, note);
  const jumps = useJumps(below, note);
  // One badge per value: an area and a circle can share a name ("work"), and link to the same topic.
  const facets = [
    ...new Map(
      tags
        .filter((t) => FACET.test(t))
        .map((t) => t.split('/'))
        .map(([f, val]) => [val, f] as const),
    ),
  ];
  const facetBadges = facets.map(([val, f]) =>
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
  );
  const tagLinks = tags
    .filter((t) => !FACET.test(t))
    .map((t) => (
      <a key={t} href={link(topicHref(t))} className="text-faint no-underline hover:text-primary">
        #{t}
      </a>
    ));
  const openLink = open.length > 0 && (
    <a
      href={link(`${href}#open-questions`)}
      className="font-medium text-destructive no-underline hover:underline"
    >
      {open.length} open {open.length === 1 ? 'question' : 'questions'}
    </a>
  );
  // With the rail beside the body, the header keeps only the type: the rest is in the rail. Without it,
  // the facets and the last change; the tags and the created date wait behind "+N", so the title sits high.
  const lastDate = upd && upd !== created ? `updated ${upd}` : created;
  const extra = [
    ...tagLinks,
    ...(!!created && lastDate !== created
      ? [
          <span key="created" className="tabular-nums">
            created {created}
          </span>,
        ]
      : []),
  ];
  const meta = (
    <>
      {facetBadges}
      {!!lastDate && <span className="tabular-nums">{lastDate}</span>}
      {openLink}
      {more ? extra : null}
      {extra.length > 0 && (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="-my-2 inline-flex min-h-8 cursor-pointer items-center rounded-md px-1.5 text-faint tabular-nums hover:text-foreground max-md:-my-3 max-md:min-h-11"
        >
          {more ? 'less' : `+${extra.length}`}
        </button>
      )}
    </>
  );
  return (
    <div className="v-note @4xl:grid @4xl:grid-cols-[minmax(0,44rem)_15rem] @4xl:justify-center @4xl:gap-12">
      <div className="mx-auto w-full min-w-0 max-w-[44rem]">
        <PageHeader
          kind={type || undefined}
          meta={<span className="contents @4xl:hidden">{meta}</span>}
          title={leadsWithTitle ? titleOf(note) : name}
        />
        {headings.length >= 3 && (
          <div className="@4xl:hidden">
            <OnThisPage headings={headings} href={href} />
          </div>
        )}
        {/* The body's own leading "# Title" is the header's title. */}
        <NoteBody
          ref={article}
          note={note}
          className="[&>h1:first-child]:hidden [&>h1:first-child+*]:mt-0"
        />
        <div ref={below} className="mt-12 empty:hidden [&_section]:scroll-mt-18">
          <NoteSections note={note} />
        </div>
        <Separator className="mt-12" />
        <footer className="mt-3 text-xs text-faint [&_a]:text-faint [&_a]:no-underline [&_a:hover]:text-primary">
          {source ? <a href={source(note.path)}>{note.path}</a> : note.path}
          <NoteActions note={note} />
        </footer>
      </div>
      <aside aria-label="On this note" className="hidden @4xl:block">
        <div className="sticky top-16 max-h-[calc(100svh-5rem)] space-y-7 overflow-y-auto pb-6 text-sm">
          {headings.length > 0 && (
            <RailGroup title="On this page">
              <Toc headings={headings} href={href} fold={true} />
            </RailGroup>
          )}
          <RailGroup title="Properties">
            <dl className="m-0 grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 [&_dd]:m-0 [&_dt]:text-faint">
              {!!type && (
                <>
                  <dt>Type</dt>
                  <dd className="capitalize">{type}</dd>
                </>
              )}
              {facetBadges.length > 0 && (
                <>
                  <dt>Facets</dt>
                  <dd className="flex flex-wrap gap-1">{facetBadges}</dd>
                </>
              )}
              {tagLinks.length > 0 && (
                <>
                  <dt>Tags</dt>
                  <dd className="flex flex-wrap gap-x-2 gap-y-0.5 [overflow-wrap:anywhere]">
                    {tagLinks}
                  </dd>
                </>
              )}
              {!!created && (
                <>
                  <dt>Created</dt>
                  <dd className="tabular-nums">{created}</dd>
                </>
              )}
              {!!upd && upd !== created && (
                <>
                  <dt>Updated</dt>
                  <dd className="tabular-nums">{upd}</dd>
                </>
              )}
            </dl>
            {openLink}
          </RailGroup>
          {jumps.length > 0 && (
            <RailGroup title="Below">
              <Jumps jumps={jumps} />
            </RailGroup>
          )}
        </div>
      </aside>
    </div>
  );
}
