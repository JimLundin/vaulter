// Navigation and settings share a bottom drawer. In expanded space the same tree is a dialog.
import { type ReactNode, useId, useRef } from 'react';
import { Button } from './parts/button.tsx';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './parts/drawer.tsx';
import { Icon } from './icons.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';
import { useRestoreFocus } from './hooks/use-restore-focus.ts';

export function MenuSheet({
  open,
  onClose,
  title,
  description,
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  const compact = useIsMobile();
  const restoreFocus = useRestoreFocus(open);
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Drawer
      open={open}
      autoFocus={true}
      handleOnly={!compact}
      repositionInputs={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        ref={ref}
        aria-describedby={description ? descriptionId : undefined}
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={(event) => {
          // Opening settings should not summon the phone keyboard or edit a preference.
          event.preventDefault();
          ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
        }}
        className="menu-sheet pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-5 md:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <DrawerTitle className={header ? 'sr-only' : 'text-copy font-semibold'}>
              {title}
            </DrawerTitle>
            {header}
            {!!description && (
              <DrawerDescription id={descriptionId}>{description}</DrawerDescription>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-none"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <Icon name="close" size="lg" />
          </Button>
        </header>
        <div className="flex min-h-0 flex-col overflow-y-auto">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
