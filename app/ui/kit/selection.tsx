import type { ReactNode } from 'react';
import { Button } from './parts/button.tsx';
import { cn } from './lib/utils.ts';
import { Icon } from './icons.tsx';

/** A generic selectable row with a multiline label and optional supporting text. */
export function SelectionRow({
  selected,
  disabled,
  onSelect,
  children,
  compact = false,
  appearance = 'plain',
  label,
  timestamp,
  marker = 'none',
  ordinal,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
  compact?: boolean;
  appearance?: 'plain' | 'card';
  label?: string;
  timestamp?: string;
  marker?: 'none' | 'number' | 'badge';
  ordinal?: number;
}) {
  return (
    <Button
      type="button"
      variant={appearance === 'card' || selected ? 'outline' : 'ghost'}
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      aria-pressed={appearance === 'card' ? selected : undefined}
      data-selection-appearance={appearance}
      onClick={onSelect}
      className={cn(
        'h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left',
        compact && 'min-h-9 py-2',
        label && 'h-9 min-h-9 overflow-hidden',
        appearance === 'card' && 'items-start gap-3 rounded-lg border-border p-4 shadow-none',
        appearance === 'card' && selected && 'border-primary bg-accent ring-1 ring-primary',
      )}
    >
      {appearance === 'card' && (
        <span
          aria-hidden={true}
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40',
            selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {!!selected && <Icon name="check" size="sm" />}
        </span>
      )}
      {label ? (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {(marker === 'number' || marker === 'badge') && (
            <span
              aria-hidden={true}
              className={cn(
                'w-4 shrink-0 text-xs font-normal tabular-nums text-muted-foreground',
                marker === 'badge' &&
                  'flex size-5 items-center justify-center rounded border border-border bg-muted/40 text-[10px]',
              )}
            >
              {String(ordinal ?? 1).padStart(2, '0')}
            </span>
          )}
          <span title={label} className="min-w-0 flex-1 truncate font-medium">
            {label}
          </span>
          {!!timestamp && (
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {timestamp}
            </span>
          )}
        </span>
      ) : appearance === 'card' ? (
        <span className="flex min-w-0 flex-1 flex-col">{children}</span>
      ) : (
        children
      )}
    </Button>
  );
}

export function SplitView({ main, supporting }: { main: ReactNode; supporting: ReactNode }) {
  return (
    <div className="kit-split-view flex h-full min-h-0 min-w-0 flex-1">
      <div className="kit-split-main flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
      {supporting}
    </div>
  );
}

export function SelectionGroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 mb-0 border-b border-border/60 px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}
