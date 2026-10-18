// Shared disclosure, metadata and action presentation; callers interpret their records.
import { useId, type ReactNode } from 'react';
import { Button } from './parts/button.tsx';
import { Icon, type IconName } from './icons.tsx';

/** An expandable titled row; its metadata, actions and details belong to the caller. */
export function ExpandableRow({
  title,
  metadata,
  expanded,
  onExpand,
  actions,
  children,
}: {
  title: string;
  metadata?: ReactNode;
  expanded: boolean;
  onExpand: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const details = useId();
  return (
    <section
      aria-label={title}
      className="border-b bg-background px-[var(--page-inset)] py-3 last:border-b-0 md:px-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            data-touch-target=""
            aria-label={title}
            aria-expanded={expanded}
            aria-controls={expanded ? details : undefined}
            onClick={onExpand}
            className="flex min-h-11 min-w-0 items-center gap-2 text-left text-label font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className={expanded ? 'rotate-90' : undefined}>
              <Icon name="chevron-right" />
            </span>
            <span className="min-w-0 break-words">{title}</span>
          </button>
          {!!metadata && <div className="pl-6 text-caption text-muted-foreground">{metadata}</div>}
        </div>
        {actions}
      </div>
      {!!expanded && (
        <div id={details} className="flex min-w-0 flex-col gap-3 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** Compact row actions retain an accessible name when their visible label hides on phones. */
export function RowAction({
  label,
  accessibleLabel = label,
  icon,
  onClick,
}: {
  label: string;
  accessibleLabel?: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" size="compact" aria-label={accessibleLabel} onClick={onClick}>
      <Icon name={icon} />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}
