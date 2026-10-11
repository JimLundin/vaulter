// One drawer for navigation, settings and supporting panels. Contents survive presentation changes.
import { type ReactNode, useId, useRef } from 'react';
import { Button } from './parts/button.tsx';
import {
  DrawerRoot,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerHeader,
} from './parts/drawer.tsx';
import { Stack } from './parts/layout.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';
import { usePresentationFocus, usePresentationPolicy } from './presentation-policy.tsx';

export function Drawer({
  open,
  onClose,
  title,
  description,
  header,
  children,
  placement = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  header?: ReactNode;
  children: ReactNode;
  placement?: 'default' | 'right';
}) {
  const compact = useLayout() === 'compact';
  const restoreFocus = usePresentationFocus(open);
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <DrawerRoot
      modal={placement === 'right' ? compact : true}
      disablePointerDismissal={placement === 'right' && !compact}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        ref={ref}
        compact={compact}
        data-side-panel={placement === 'right' ? true : undefined}
        data-layout={placement === 'right' ? (compact ? 'compact' : 'wide') : undefined}
        role={placement === 'right' && !compact ? 'complementary' : 'dialog'}
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        finalFocus={restoreFocus}
        initialFocus={() => ref.current?.querySelector<HTMLButtonElement>('button') ?? ref.current}
      >
        <DrawerHeader>
          <Stack gap="xs">
            <DrawerTitle hidden={!!header}>{title}</DrawerTitle>
            {header}
            {!!description && (
              <DrawerDescription id={descriptionId}>{description}</DrawerDescription>
            )}
          </Stack>
          <Button
            variant="ghost"
            size="standard"
            iconOnly={true}
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <Icon name="close" size="lg" />
          </Button>
        </DrawerHeader>
        <ScrollArea grow={true}>{children}</ScrollArea>
      </DrawerContent>
    </DrawerRoot>
  );
}

// Private composition: the same Drawer Popup becomes an in-flow panel or centred dialog.
export function SupportingDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
}) {
  const layout = useLayout();
  const policy = usePresentationPolicy();
  const wide = layout === 'wide';
  const restoreFocus = usePresentationFocus(open);
  return (
    <DrawerRoot
      open={open}
      modal={!wide}
      disablePointerDismissal={wide}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        inline={true}
        arrangement="panel"
        compact={layout === 'compact'}
        data-layout={layout}
        role={wide ? 'complementary' : 'dialog'}
        aria-modal={policy.modal && !wide ? true : undefined}
        aria-label={title}
        aria-describedby={undefined}
        finalFocus={restoreFocus}
        initialFocus={true}
      >
        {children}
      </DrawerContent>
    </DrawerRoot>
  );
}
