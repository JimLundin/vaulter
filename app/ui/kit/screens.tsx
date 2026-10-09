// Device-specific presentations for search and change history, with behavior supplied by callers.
import type { ReactNode } from 'react';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';
import { FeaturePage } from './app.tsx';
import { AdaptiveDialog } from './overlay.tsx';

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
  return (
    <AdaptiveDialog
      open={open}
      onClose={onClose}
      title="Search or ask"
      closeLabel="Close search"
      hideTitle={!mobile}
      fullScreen={true}
      focusInput={true}
    >
      <div
        className={
          mobile
            ? 'flex min-h-0 flex-1 flex-col [&_[data-slot=command]]:rounded-none [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-list]]:max-h-none [&_[data-slot=command-list]]:flex-1 [&_[data-slot=command-item]]:min-h-13 [&_[data-slot=command-item]]:px-3 [&_[data-slot=command-item]]:py-3 [&_[data-slot=command-group]]:px-2 [&_[data-slot=command-group-label]]:pt-5'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        {children}
      </div>
    </AdaptiveDialog>
  );
}

export function HistorySurface({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <FeaturePage title="History" description="Changes to your vault, newest first.">
      <div className={mobile ? 'flex flex-col gap-4 py-3' : 'flex flex-col gap-4'}>{children}</div>
    </FeaturePage>
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
  return (
    <section className="border-b px-[var(--page-inset)] pb-4 md:border-t md:border-b-0 md:px-0 md:py-5">
      <div className="flex items-start justify-between gap-2 md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            data-touch-target=""
            aria-label={title}
            aria-expanded={expanded}
            onClick={onExpand}
            className="flex min-h-11 min-w-0 items-center gap-2 text-left text-copy font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Icon name={expanded ? 'chevron-left' : 'chevron-right'} />
            <span className="min-w-0 break-words">{title}</span>
          </button>
          <p className="m-0 pl-6 text-caption text-muted-foreground">
            {date} · <span className="font-mono">{sha}</span>
          </p>
        </div>
        {!!onRevert && (
          <Button variant="outline" size="sm" aria-label={`Revert ${title}`} onClick={onRevert}>
            <Icon name="undo" />
            <span className="hidden md:inline">Revert</span>
          </Button>
        )}
      </div>
      {!!expanded && <div className="flex flex-col gap-3 pt-4 pl-6">{children}</div>}
    </section>
  );
}
