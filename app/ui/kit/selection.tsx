import type { ReactNode } from 'react';
import { Button } from './parts/button.tsx';
import { cn } from './lib/utils.ts';

/** A generic selectable row with a multiline label and optional supporting text. */
export function SelectionRow({
  selected,
  disabled,
  onSelect,
  children,
  compact = false,
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
  label?: string;
  timestamp?: string;
  marker?: 'none' | 'number' | 'badge';
  ordinal?: number;
}) {
  return (
    <Button
      variant={selected ? 'outline' : 'ghost'}
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left',
        compact && 'min-h-9 py-2',
        label && 'h-9 min-h-9 overflow-hidden',
      )}
    >
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
      ) : (
        children
      )}
    </Button>
  );
}

export function SplitView({ main, supporting }: { main: ReactNode; supporting: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
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
