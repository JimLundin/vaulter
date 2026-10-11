import { type ReactNode, useEffect } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { Drawer } from './drawer.tsx';
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
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
  compact?: boolean;
  label?: string;
  timestamp?: string;
  marker?: 'none' | 'dot' | 'rail';
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
          {marker !== 'none' && (
            <span
              aria-hidden={true}
              className={cn(
                'relative flex h-5 w-2 shrink-0 items-center justify-center',
                marker === 'rail' &&
                  'before:absolute before:inset-y-[-12px] before:left-1/2 before:w-px before:bg-border',
              )}
            >
              <span
                className={cn(
                  'relative size-1.5 rounded-full',
                  selected ? 'bg-foreground' : 'bg-muted-foreground/50',
                )}
              />
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

/** A persistent supporting column with its own scrolling, alongside the main content. */
export function SupportingColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside
      aria-label={title}
      className="h-full min-h-0 w-72 shrink-0 overflow-y-auto border-l bg-background p-4"
    >
      <h2 className="mb-4 text-copy font-semibold">{title}</h2>
      {children}
    </aside>
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

/** Keeps desktop supporting content present and uses the shared drawer only on mobile. */
export function ResponsiveSupportingColumn({
  title,
  open,
  onClose,
  onVisible,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onVisible: (visible: boolean) => void;
  children: ReactNode;
}) {
  const mobile = useLayout() === 'compact';
  const visible = !mobile || open;
  useEffect(() => {
    onVisible(visible);
  }, [visible, onVisible]);
  return mobile ? (
    <Drawer open={open} onClose={onClose} title={title}>
      {children}
    </Drawer>
  ) : (
    <SupportingColumn title={title}>{children}</SupportingColumn>
  );
}

export function SelectionGroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 mb-0 border-b border-border/60 px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}
