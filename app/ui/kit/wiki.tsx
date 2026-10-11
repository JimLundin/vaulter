import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { Icon } from './icons.tsx';
import { ResponsiveSupportingColumn } from './selection.tsx';

/** Reading and supporting panes fill the app frame and own independent scrolling. */
export function WikiPageSurface({
  title,
  summary,
  metadata,
  subjectTags,
  children,
  evidence,
  onCloseEvidence,
  onShowReferences,
  referencesOpen,
  onBack,
  connections,
  records,
  referenceKey,
}: {
  title: string;
  summary?: string;
  metadata?: ReactNode;
  subjectTags?: ReactNode;
  children: ReactNode;
  evidence: ReactNode;
  onCloseEvidence: () => void;
  onShowReferences: () => void;
  referencesOpen: boolean;
  onBack: () => void;
  connections?: ReactNode;
  records?: ReactNode;
  referenceKey?: string;
}) {
  const references = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new reference selection resets the shared scroll viewport
  useLayoutEffect(() => {
    const viewport = references.current?.closest('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = 0;
  }, [referenceKey]);
  return (
    <div className="kit-wiki-page">
      <div className="kit-wiki-reading">
        <div className="kit-wiki-toolbar" role="toolbar" aria-label="Wiki page">
          <button type="button" className="kit-wiki-back" onClick={onBack}>
            <Icon name="chevron-left" size="sm" />
            Wiki
          </button>
          <button
            type="button"
            className="kit-wiki-toolbar-title kit-wiki-title"
            title={title}
            onClick={onShowReferences}
            aria-description="Open page references"
          >
            {title}
          </button>
        </div>
        <article className="kit-wiki-article">
          <header className="flex flex-col gap-3">
            <h1 className="m-0 font-serif text-display">
              <button
                type="button"
                className="kit-wiki-title"
                onClick={onShowReferences}
                aria-description="Open page references"
              >
                {title}
              </button>
            </h1>
            <fieldset className="kit-wiki-facets" aria-label="Subject classification">
              {metadata}
            </fieldset>
            {!!summary && <p className="m-0 font-serif text-lead">{summary}</p>}
            {!!subjectTags && (
              <fieldset className="kit-wiki-tags" aria-label="Subject tags">
                {subjectTags}
              </fieldset>
            )}
          </header>
          <div className="kit-wiki-body">{children}</div>
          {!!connections && (
            <section className="kit-wiki-record-section">
              <h2>Connections</h2>
              {connections}
            </section>
          )}
          {!!records && (
            <section className="kit-wiki-record-section">
              <h2>Questions & next steps</h2>
              {records}
            </section>
          )}
        </article>
      </div>
      <ResponsiveSupportingColumn
        title="References"
        open={referencesOpen}
        onClose={onCloseEvidence}
      >
        <div ref={references} key={referenceKey} className="kit-wiki-panel-content">
          {evidence}
        </div>
      </ResponsiveSupportingColumn>
    </div>
  );
}
