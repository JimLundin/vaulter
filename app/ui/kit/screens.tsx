// Responsive search presentation with behavior supplied by callers.
import type { ReactNode } from 'react';
import { useLayout } from './hooks/use-layout.ts';
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
  const mobile = useLayout() === 'compact';
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
