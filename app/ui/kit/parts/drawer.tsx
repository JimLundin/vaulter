'use client';

// Base UI structure and gesture variables follow shadcn's current Base UI drawer.
import * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import {
  PresentationSurface,
  usePresentationPolicy,
  usePresentationSurface,
} from '../presentation-policy.tsx';
import { cn } from '../lib/utils.ts';

function DrawerRoot({ modal = true, onOpenChange, ...props }: DrawerPrimitive.Root.Props) {
  const surface = usePresentationSurface(props.open ?? false);
  return (
    <PresentationSurface id={surface.id}>
      <DrawerPrimitive.Root
        {...props}
        swipeDirection="down"
        modal={surface.policy.bounded ? false : modal}
        disablePointerDismissal={surface.policy.bounded ? true : props.disablePointerDismissal}
        onOpenChange={(open, details) => {
          if (!open && !surface.allowClose(details)) return;
          onOpenChange?.(open, details);
        }}
      />
    </PresentationSurface>
  );
}

function DrawerContent({
  children,
  className,
  arrangement = 'menu',
  inline = false,
  compact = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  arrangement?: 'menu' | 'panel';
  inline?: boolean;
  compact?: boolean;
}) {
  const policy = usePresentationPolicy();
  const [anchor, setAnchor] = React.useState<HTMLDivElement | null>(null);
  const content = (
    <>
      <DrawerPrimitive.Backdrop
        data-slot="drawer-overlay"
        className={cn(
          'kit-drawer-backdrop fixed inset-0 z-40 bg-black/50',
          policy.bounded && 'pointer-events-none',
        )}
      />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="kit-drawer-viewport pointer-events-none"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-arrangement={arrangement}
          data-compact={compact}
          className={cn(
            'kit-drawer pointer-events-auto flex min-h-0 flex-col bg-background outline-none',
            className,
          )}
          {...props}
        >
          <div
            data-slot="drawer-swipe-handle"
            aria-hidden={true}
            className="kit-drawer-handle mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted"
          />
          <DrawerPrimitive.Content
            data-slot="drawer-body"
            data-base-ui-swipe-ignore={compact ? undefined : ''}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </>
  );
  // The supporting panel stays at its original place in the workspace even as its geometry changes.
  return inline ? (
    <div ref={setAnchor} className="kit-supporting-drawer-anchor">
      {anchor && <DrawerPrimitive.Portal container={anchor}>{content}</DrawerPrimitive.Portal>}
    </div>
  ) : (
    <DrawerPrimitive.Portal container={policy.portal}>{content}</DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-5 text-left md:px-6',
        className,
      )}
      {...props}
    />
  );
}
function DrawerTitle({
  hidden,
  className,
  ...props
}: DrawerPrimitive.Title.Props & { hidden?: boolean }) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-copy font-semibold text-foreground', hidden && 'sr-only', className)}
      {...props}
    />
  );
}
function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { DrawerRoot, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription };
