// Device-specific presentations for search and change history, with behavior supplied by callers.
import { type ReactNode, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from './parts/dialog.tsx';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';
import { Overlay } from './app.tsx';

/** Phone search uses the screen for results and touch targets, desktop uses the command dialog. */
export function SearchSurface({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  if (mobile)
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          ref={ref}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            ref.current?.querySelector<HTMLInputElement>('[cmdk-input]')?.focus();
          }}
          aria-describedby={undefined}
          className="inset-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-w-none"
        >
          <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11 rounded-none"
              aria-label="Close search"
              onClick={onClose}
            >
              <Icon name="arrow-left" size="lg" />
            </Button>
            <DialogTitle className="text-sm">Search or ask</DialogTitle>
          </header>
          <div className="min-h-0 flex-1 [&_[cmdk-root]]:rounded-none [&_[data-slot=command-input-wrapper]]:h-14 [&_[cmdk-input]]:text-base [&_[cmdk-list]]:max-h-none [&_[cmdk-list]]:flex-1 [&_[cmdk-item]]:min-h-13 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 [&_[cmdk-group]]:px-2 [&_[cmdk-group-heading]]:pt-5">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    );
  return (
    <Overlay
      mobile={false}
      open={open}
      onClose={onClose}
      title="Search or ask"
      hideTitle={true}
      description="Search your notes and commands."
    >
      {children}
    </Overlay>
  );
}

export function HistorySurface({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <article
      data-layout={mobile ? 'mobile-history' : 'desktop-history'}
      className={mobile ? 'flex flex-col' : 'flex max-w-4xl flex-col px-12 py-9'}
    >
      {mobile ? (
        <header className="border-b px-4 py-4">
          <h1 className="m-0 text-xl font-semibold">History</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
            Changes to your vault, newest first
          </p>
        </header>
      ) : (
        <header className="pb-6">
          <h1 className="m-0 font-serif text-[40px] leading-tight font-medium">History</h1>
          <p className="mt-3 mb-0 text-[15px] text-muted-foreground">
            Commits made from this app, newest first.
          </p>
        </header>
      )}
      <div className={mobile ? 'flex flex-col gap-4 py-3' : 'flex flex-col gap-4'}>{children}</div>
    </article>
  );
}

export function HistoryEntry({
  title,
  date,
  sha,
  expanded,
  onExpand,
  onRevert,
  children,
}: {
  title: string;
  date: string;
  sha: string;
  expanded: boolean;
  onExpand: () => void;
  onRevert?: () => void;
  children?: ReactNode;
}) {
  const mobile = useIsMobile();
  return mobile ? (
    <section className="border-b px-4 pb-4">
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label={title}
          aria-expanded={expanded}
          onClick={onExpand}
          className="flex min-h-13 min-w-0 flex-1 items-start gap-2 py-3 text-left text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="min-w-0 flex-1 break-words">{title}</span>
          <Icon name={expanded ? 'chevron-left' : 'chevron-right'} />
        </button>
        {!!onRevert && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-none"
            aria-label={`Revert ${title}`}
            onClick={onRevert}
          >
            <Icon name="undo" />
          </Button>
        )}
      </div>
      <p className="m-0 text-[11px] text-muted-foreground">
        {date} · <span className="font-mono">{sha}</span>
      </p>
      {!!expanded && <div className="flex flex-col gap-3 pt-4">{children}</div>}
    </section>
  ) : (
    <section className="border-t py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            aria-label={title}
            aria-expanded={expanded}
            onClick={onExpand}
            className="flex min-w-0 items-center gap-2 text-left text-[15px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Icon name={expanded ? 'chevron-left' : 'chevron-right'} />
            <span className="min-w-0 break-words">{title}</span>
          </button>
          <p className="m-0 pl-6 text-xs text-muted-foreground">
            {date} · <span className="font-mono">{sha}</span>
          </p>
        </div>
        {!!onRevert && (
          <Button variant="outline" size="sm" onClick={onRevert}>
            <Icon name="undo" />
            Revert
          </Button>
        )}
      </div>
      {!!expanded && <div className="flex flex-col gap-3 pt-4 pl-6">{children}</div>}
    </section>
  );
}
