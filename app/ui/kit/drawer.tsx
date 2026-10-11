// One drawer frame owns headers, dismissal, focus, scrolling and responsive presentation.
import { type ReactNode, useEffect, useId, useRef } from 'react';
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
  scroll = true,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  header?: ReactNode;
  children?: ReactNode;
  /** Placement changes geometry only; every role uses the same frame and controls. */
  placement?: 'default' | 'right' | 'reading' | 'supporting';
  /** Content with its own feed and dock retains control of scrolling. */
  scroll?: boolean;
  /** A persistent supporting panel keeps its frame open and omits dismissal controls. */
  dismissible?: boolean;
}) {
  const layout = useLayout();
  const compact = layout === 'compact';
  const supporting = placement === 'supporting';
  const beside = placement !== 'default' && (supporting ? layout === 'wide' : !compact);
  const inline = supporting || placement === 'reading';
  const restoreFocus = usePresentationFocus(open);
  const policy = usePresentationPolicy();
  const opener = useRef<HTMLElement | null>(null);
  const openedModal = useRef<boolean>(false);
  if (open) openedModal.current = !beside;
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // A different cited passage can become the opener while the same drawer stays open.
  useEffect(() => {
    if (placement !== 'reading') return;
    const remember = (event?: Event) => {
      const active =
        event?.type === 'pointerdown' && event.target instanceof Element
          ? event.target.closest<HTMLElement>('button, a, input, textarea, [tabindex]')
          : document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        policy.owns(active) &&
        !ref.current?.contains(active)
      )
        opener.current = active;
    };
    if (open) remember();
    document.addEventListener('pointerdown', remember, true);
    document.addEventListener('focusin', remember);
    return () => {
      document.removeEventListener('pointerdown', remember, true);
      document.removeEventListener('focusin', remember);
    };
  }, [open, policy, placement]);
  return (
    <DrawerRoot
      modal={!beside}
      disablePointerDismissal={beside}
      open={open}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose();
      }}
    >
      <DrawerContent
        ref={ref}
        inline={inline}
        arrangement={placement === 'default' ? 'menu' : 'panel'}
        compact={compact}
        data-drawer-placement={placement}
        data-layout={placement === 'default' ? undefined : beside ? 'wide' : layout}
        role={beside ? 'complementary' : 'dialog'}
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        finalFocus={() => {
          if (placement !== 'reading') return restoreFocus();
          // biome-ignore lint/suspicious/noUnnecessaryConditions: Base UI invokes this callback after the open arrangement changes
          if (!openedModal.current) return false;
          const target = opener.current;
          return target?.isConnected &&
            target.getClientRects().length &&
            !target.matches(':disabled')
            ? target
            : restoreFocus();
        }}
        initialFocus={
          beside && !supporting
            ? false
            : () => ref.current?.querySelector<HTMLButtonElement>('button') ?? ref.current
        }
      >
        <DrawerHeader>
          <Stack gap="xs">
            <DrawerTitle hidden={!!header}>{title}</DrawerTitle>
            {header}
            {!!description && (
              <DrawerDescription id={descriptionId}>{description}</DrawerDescription>
            )}
          </Stack>
          {!!dismissible && (
            <Button
              variant="ghost"
              size="standard"
              iconOnly={true}
              aria-label={`Close ${title.toLowerCase()}`}
              onClick={onClose}
            >
              <Icon name="close" size="lg" />
            </Button>
          )}
        </DrawerHeader>
        {scroll ? (
          <ScrollArea grow={true}>
            <div data-slot="drawer-inset">{children}</div>
          </ScrollArea>
        ) : (
          children
        )}
      </DrawerContent>
    </DrawerRoot>
  );
}
