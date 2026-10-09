// One dialog tree: resizing moves and resizes it without discarding its contents or focus.
import { type ReactNode, useRef } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { Button } from './parts/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './parts/dialog.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';

export function AdaptiveDialog({
  open,
  onClose,
  title,
  description,
  hideTitle,
  tall,
  fullScreen,
  focusInput,
  closeLabel = 'Close',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  hideTitle?: boolean;
  tall?: boolean;
  fullScreen?: boolean;
  focusInput?: boolean;
  closeLabel?: string;
  children?: ReactNode;
}) {
  const compact = useLayout() === 'compact';
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        ref={ref}
        showCloseButton={false}
        {...(description ? {} : { 'aria-describedby': undefined })}
        initialFocus={() =>
          focusInput ? (ref.current?.querySelector<HTMLInputElement>('input') ?? true) : true
        }
        className={cn(
          'flex max-h-[min(90dvh,var(--viewport-height,90dvh))] flex-col gap-0 overflow-hidden p-0',
          compact
            ? fullScreen
              ? 'inset-x-0 top-[var(--viewport-top,0px)] h-[var(--viewport-height,100dvh)] max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 pt-[env(safe-area-inset-top)] sm:max-w-none'
              : 'inset-x-0 top-auto bottom-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-lg sm:max-w-none'
            : 'w-full max-w-lg',
          tall && !fullScreen && (compact ? 'h-[90dvh]' : 'h-[80dvh]'),
        )}
      >
        <header
          className={cn(
            'flex shrink-0 items-start justify-between gap-3 p-4',
            compact && fullScreen && 'items-center border-b py-1',
          )}
        >
          <div className={cn('flex min-w-0 flex-col gap-1', hideTitle && 'sr-only')}>
            <DialogTitle className="text-copy font-semibold">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
            <Icon name={fullScreen && compact ? 'arrow-left' : 'close'} />
          </Button>
        </header>
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            fullScreen
              ? 'pb-[env(safe-area-inset-bottom)]'
              : 'gap-4 px-4 pb-[max(24px,env(safe-area-inset-bottom))]',
          )}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Overlay(
  props: Omit<Parameters<typeof AdaptiveDialog>[0], 'fullScreen' | 'focusInput'>,
) {
  return <AdaptiveDialog {...props} />;
}
