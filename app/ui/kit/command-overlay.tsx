// Shared command-list presentation; callers own results, query, copy and actions.
import type { ReactNode } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { AdaptiveDialog } from './overlay.tsx';

/** Compact item selection uses the screen; wider selection uses a centered command dialog. */
export function CommandOverlay({
  open,
  onClose,
  children,
  title,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
  closeLabel: string;
}) {
  const mobile = useLayout() === 'compact';
  return (
    <AdaptiveDialog
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
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
