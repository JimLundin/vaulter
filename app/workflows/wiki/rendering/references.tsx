import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../../ui/kit/index.ts';
import { isSafeUrl } from '../../../vault/documents/notes/safe-url.ts';
import type { WikiReference } from '../pages.ts';

export function ReferenceCard({ reference }: { reference: WikiReference }) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [fadeStart, setFadeStart] = useState(false);
  const [fadeEnd, setFadeEnd] = useState(false);
  const contextRef = useRef<HTMLQuoteElement>(null);
  const contextId = useId();
  const { title, href, context: quote = '', author, date, range, state, speaker } = reference;
  const safeHref = href && isSafeUrl(href) ? href : undefined;
  const external = !!safeHref && /^https?:/.test(safeHref);
  const attribution = [
    speaker ? (speaker === 'user' ? 'User' : 'Agent report') : author,
    date ? new Date(date).toLocaleDateString() : '',
    external ? new URL(safeHref!).hostname : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // A citation's supporting span stays visible even in a long retained source.
  const start = !expanded && range ? Math.max(0, range.start - 60) : 0;
  const end = expanded
    ? quote.length
    : Math.min(quote.length, Math.max(start + 320, range?.end ?? 0));
  useLayoutEffect(() => {
    const context = contextRef.current;
    if (!(context && quote)) {
      setClipped(false);
      return;
    }
    const measure = () => {
      if (!expanded || range) {
        context.scrollTop = 0;
        const mark = context.querySelector('mark');
        if (mark) {
          const viewport = context.getBoundingClientRect();
          const selection = mark.getBoundingClientRect();
          if (selection.bottom > viewport.bottom)
            context.scrollTop = Math.max(0, selection.top - viewport.top - 24);
        }
      }
      setClipped(context.scrollHeight > context.clientHeight + 1);
      setFadeStart(!expanded && (start > 0 || context.scrollTop > 0));
      setFadeEnd(
        !expanded &&
          (end < quote.length ||
            context.scrollHeight - context.scrollTop > context.clientHeight + 1),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(context);
    return () => observer.disconnect();
  }, [expanded, quote, range, start, end]);
  const truncated = start > 0 || end < quote.length || clipped;
  const passage = !!quote && (
    <blockquote
      ref={contextRef}
      id={contextId}
      className="kit-wiki-context"
      aria-label="Source context"
      data-expanded={expanded}
      data-fade-start={fadeStart}
      data-fade-end={fadeEnd}
      tabIndex={expanded ? 0 : undefined}
    >
      {range ? (
        <>
          {quote.slice(start, range.start)}
          <mark>{quote.slice(range.start, range.end)}</mark>
          {quote.slice(range.end, end)}
        </>
      ) : (
        quote.slice(start, end)
      )}
    </blockquote>
  );
  const byline = !!attribution && (
    <p className="kit-wiki-source-attribution kit-wiki-muted" title={attribution}>
      {attribution}
    </p>
  );
  const sourceTitle = safeHref ? (
    <a
      href={safeHref}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="kit-wiki-source-title"
    >
      <span className="kit-wiki-source-title-text">{title}</span>{' '}
      <span aria-hidden="true">{external ? '↗' : '→'}</span>
    </a>
  ) : (
    title
  );
  return (
    <section className="kit-wiki-source-card">
      {!!(expanded || truncated) && (
        <button
          type="button"
          className="kit-wiki-reference-toggle"
          aria-label={`Context from ${title}`}
          aria-expanded={expanded}
          aria-controls={contextId}
          onClick={() => setExpanded(!expanded)}
        />
      )}
      <header className="kit-wiki-source-heading">
        <h3 title={title}>{sourceTitle}</h3>
        {byline}
      </header>
      {passage}
      {!quote && <span className="kit-wiki-source-url">No retained passage</span>}
      {state !== 'original' && (
        <p className="kit-wiki-source-notice">
          <Icon name="history" size="sm" />
          {state === 'newer' ? 'Source has a newer version.' : 'Source was removed.'} This excerpt
          stays tied to the original.
        </p>
      )}
    </section>
  );
}
