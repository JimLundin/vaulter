// A note: its type, facets and tags, the body, and below it what every extension adds (NoteSections);
// the footer links to the source and to each extension's actions on it.
import { useEffect, useState } from 'react';
import type { Note } from '../../../core/note-fields.ts';
import { asList, hrefOf, kind, topicHref } from '../../../core/note-fields.ts';
import { dateStr } from '../../../core/format.ts';
import { useHost, NoteSections, NoteActions } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { renderBody, mdxReady, loadMdx } from '../../core/markdown.ts';
import './note.css';
import { later } from '../../core/later.ts';

export function NoteBody({ note }: { note: Note }) {
  const { mdx } = useHost();
  const [, setMdx] = useState(mdxReady());
  useEffect(() => {
    if (note.ext === 'mdx' && !mdxReady()) later(loadMdx().then(() => setMdx(true)));
  }, [note.ext]);
  return <article className="note">{renderBody(note, mdx)}</article>;
}

export function NotePage({ note }: { note: Note }) {
  const { vault: v, source } = useHost();
  const d = note.data;
  const tags = asList(d.tags);
  const type = d.type ? String(d.type) : kind(note.id) === 'daily' ? 'daily' : '';
  const created = dateStr(d.created ?? d.date);
  const upd = v.updated.get(note.id) ?? '';
  const open = asList(d.open);
  return (
    <div className="v-note">
      {!!(type || tags.length > 0 || created) && (
        <div className="meta">
          {!!type && <span className="chip">{type}</span>}
          {tags
            .filter((t) => /^(area|status|circle)\//.test(t))
            .map((t) => t.split('/'))
            .map(([f, val]) =>
              f === 'status' ? (
                <span key={val} className={`facet f-${f} v-${val}`}>
                  {val.replace('-', ' ')}
                </span>
              ) : (
                <a key={val} className={`facet f-${f} v-${val}`} href={link(topicHref(val))}>
                  {val.replace('-', ' ')}
                </a>
              ),
            )}
          {tags
            .filter((t) => !/^(area|status|circle)\//.test(t))
            .map((t) => (
              <a key={t} className="tag" href={link(topicHref(t))}>
                #{t}
              </a>
            ))}
          {!!created && <span className="date">{created}</span>}
          {!!upd && upd !== created && <span className="date">updated {upd}</span>}
          {open.length > 0 && (
            <a className="openq" href={link(`${hrefOf(note)}#open-questions`)}>
              {open.length} open {open.length === 1 ? 'question' : 'questions'}
            </a>
          )}
        </div>
      )}
      <NoteBody note={note} />
      <div className="sects">
        <NoteSections note={note} />
      </div>
      <footer className="src">
        {source ? <a href={source(note.path)}>{note.path}</a> : note.path}
        <NoteActions note={note} />
      </footer>
    </div>
  );
}
