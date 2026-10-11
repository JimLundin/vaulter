import { type ReactNode, useEffect, useRef } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { DrawerRoot, DrawerContent, DrawerTitle } from './parts/drawer.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';

/** Selected Wiki design: readable prose and evidence beside it, sharing the phone drawer. */
export function WikiPageSurface({
  title,
  summary,
  metadata,
  children,
  evidence,
  onCloseEvidence,
}: {
  title: string;
  summary?: string;
  metadata?: string;
  children: ReactNode;
  evidence?: ReactNode;
  onCloseEvidence: () => void;
}) {
  const mobile = useLayout() === 'compact';
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (evidence && document.activeElement instanceof HTMLButtonElement)
      opener.current = document.activeElement;
  }, [evidence]);
  return (
    <div className="flex w-full min-w-0 flex-col gap-8 px-[var(--page-inset)] py-[var(--page-block)] md:flex-row md:gap-10">
      <article className="mx-auto flex w-full min-w-0 max-w-[var(--reading-width)] flex-1 flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="text-label text-muted-foreground">{metadata}</span>
          <h1 className="m-0 font-serif text-display">{title}</h1>
          {!!summary && <p className="m-0 font-serif text-lead">{summary}</p>}
        </header>
        {children}
      </article>
      <DrawerRoot
        open={!!evidence}
        modal={mobile}
        disablePointerDismissal={!mobile}
        onOpenChange={(open) => {
          if (!open) onCloseEvidence();
        }}
      >
        <DrawerContent
          inline={true}
          arrangement="panel"
          compact={mobile}
          data-layout={mobile ? 'compact' : 'wide'}
          role={mobile ? 'dialog' : 'complementary'}
          aria-label="Why the page says this"
          aria-describedby={undefined}
          finalFocus={() => opener.current as HTMLElement | null}
          initialFocus={mobile}
          className="kit-evidence-panel"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3 md:px-0 md:pt-0">
            <DrawerTitle className="text-label font-medium uppercase tracking-wide text-muted-foreground">
              Why the page says this
            </DrawerTitle>
            <Button
              variant="ghost"
              size="standard"
              iconOnly={true}
              aria-label="Close why the page says this"
              onClick={onCloseEvidence}
            >
              <Icon name="close" />
            </Button>
          </div>
          <ScrollArea grow={true}>
            <div className="flex flex-col gap-3 px-4 pb-6 md:px-0 md:pb-0">{evidence}</div>
          </ScrollArea>
        </DrawerContent>
      </DrawerRoot>
      {!(mobile || evidence) && (
        <aside className="w-[340px] shrink-0 text-label text-muted-foreground">
          Select an underlined statement to see where it came from.
        </aside>
      )}
    </div>
  );
}
