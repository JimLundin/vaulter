// Shared disclosure and retained-passage presentation; callers own source meaning and navigation.
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

export function PassageCard({
  title,
  label,
  text,
  selection,
  attribution,
  notice,
  empty,
  disclosureLabel,
  contextLabel = 'Passage context',
}: {
  title: ReactNode;
  label: string;
  text: string;
  /** Half-open string offsets supplied by the caller; the kit marks the supplied text only. */
  selection?: { start: number; end: number };
  attribution?: ReactNode;
  notice?: ReactNode;
  empty?: ReactNode;
  disclosureLabel: string;
  contextLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [fadeStart, setFadeStart] = useState(false);
  const [fadeEnd, setFadeEnd] = useState(false);
  const contextRef = useRef<HTMLQuoteElement>(null);
  const contextId = useId();
  const markStart = selection ? Math.max(0, Math.min(text.length, selection.start)) : undefined;
  const markEnd = selection
    ? Math.max(markStart!, Math.min(text.length, selection.end))
    : undefined;
  const start = !expanded && markStart !== undefined ? Math.max(0, markStart - 60) : 0;
  const end = expanded ? text.length : Math.min(text.length, Math.max(start + 320, markEnd ?? 0));
  // biome-ignore lint/correctness/useExhaustiveDependencies: supplied marks changing in expanded context must reveal the new selection
  useLayoutEffect(() => {
    const context = contextRef.current;
    if (!(context && text)) {
      setClipped(false);
      return;
    }
    const revealSelection = () => {
      context.scrollTop = 0;
      const mark = context.querySelector('mark');
      if (mark) {
        const viewport = context.getBoundingClientRect();
        const markedBounds = mark.getBoundingClientRect();
        if (markedBounds.bottom > viewport.bottom)
          context.scrollTop = Math.max(0, markedBounds.top - viewport.top - 24);
      }
    };
    const measure = () => {
      if (!expanded) revealSelection();
      setClipped(context.scrollHeight > context.clientHeight + 1);
      setFadeStart(!expanded && (start > 0 || context.scrollTop > 0));
      setFadeEnd(
        !expanded &&
          (end < text.length ||
            context.scrollHeight - context.scrollTop > context.clientHeight + 1),
      );
    };
    revealSelection();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(context);
    return () => observer.disconnect();
  }, [expanded, text, markStart, markEnd, start, end]);
  const truncated = start > 0 || end < text.length || clipped;
  return (
    <section className="kit-passage-card" aria-label={label}>
      {!!(expanded || truncated) && (
        <button
          type="button"
          className="kit-passage-toggle"
          aria-label={disclosureLabel}
          aria-expanded={expanded}
          aria-controls={contextId}
          onClick={() => setExpanded(!expanded)}
        />
      )}
      <header className="kit-passage-heading">
        <h3>{title}</h3>
        {!!attribution && <div className="kit-passage-attribution">{attribution}</div>}
      </header>
      {!!text && (
        <blockquote
          ref={contextRef}
          id={contextId}
          className="kit-passage-context"
          aria-label={contextLabel}
          data-expanded={expanded}
          data-fade-start={fadeStart}
          data-fade-end={fadeEnd}
          tabIndex={expanded ? 0 : undefined}
        >
          {markStart !== undefined ? (
            <>
              {text.slice(start, markStart)}
              <mark>{text.slice(markStart, markEnd)}</mark>
              {text.slice(markEnd, end)}
            </>
          ) : (
            text.slice(start, end)
          )}
        </blockquote>
      )}
      {!text && <div className="kit-passage-empty">{empty}</div>}
      {!!notice && <div className="kit-passage-notice">{notice}</div>}
    </section>
  );
}
