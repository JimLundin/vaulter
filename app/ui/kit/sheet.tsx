// Navigation and settings share a bottom drawer. In expanded space the same tree is a dialog.
import { type ReactNode, useId, useRef } from 'react';
import { Button } from './parts/button.tsx';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerHeader,
} from './parts/drawer.tsx';
import { Stack } from './parts/layout.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';
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
  const compact = useLayout() === 'compact';
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
        variant="menu"
      >
        <DrawerHeader variant="toolbar">
          <Stack gap="xs">
            <DrawerTitle hidden={!!header}>{title}</DrawerTitle>
            {header}
            {!!description && (
              <DrawerDescription id={descriptionId}>{description}</DrawerDescription>
            )}
          </Stack>
          <Button
            variant="ghost"
            size="square"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <Icon name="close" size="lg" />
          </Button>
        </DrawerHeader>
        <ScrollArea grow={true}>{children}</ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
