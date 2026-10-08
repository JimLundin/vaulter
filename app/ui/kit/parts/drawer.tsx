'use client';

import * as React from 'react';
import { usePresentation } from '../presentation.tsx';
import { usePreviewInteraction } from '../hooks/use-preview-interaction.ts';
import { cn } from '../lib/utils.ts';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Dialog as DialogPrimitive } from 'radix-ui';

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const presentation = usePresentation();
  return presentation ? (
    <PreviewDrawer {...props} container={presentation.portal} />
  ) : (
    <DrawerPrimitive.Root data-slot="drawer" {...props} />
  );
}

// Vaul's modal=false suppresses its own body effects, but its internal Radix Root still defaults to
// modal. A local Radix context uses the same controlled open state and the very same Vaul contents.
function PreviewDrawer({ children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const [open, setOpen] = React.useState(props.defaultOpen ?? false);
  const current = props.open ?? open;
  const change = (next: boolean) => {
    setOpen(next);
    props.onOpenChange?.(next);
  };
  return (
    <DrawerPrimitive.Root
      {...props}
      open={current}
      onOpenChange={change}
      modal={false}
      noBodyStyles={true}
      disablePreventScroll={true}
    >
      <DialogPrimitive.Root modal={false} open={current} onOpenChange={change}>
        {children}
      </DialogPrimitive.Root>
    </DrawerPrimitive.Root>
  );
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  const presentation = usePresentation();
  return (
    <DrawerPrimitive.Portal
      data-slot="drawer-portal"
      {...props}
      container={presentation?.portal ?? props.container}
    />
  );
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  const presentation = usePresentation();
  if (presentation)
    return (
      <div
        data-slot="drawer-overlay"
        className="pointer-events-none fixed inset-0 z-50 bg-black/50"
      />
    );
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { variant?: 'default' | 'menu' }) {
  const onInteractOutside = usePreviewInteraction(props.onInteractOutside);
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-background',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
          'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm',
          variant === 'menu' && 'menu-sheet pb-[max(16px,env(safe-area-inset-bottom))]',
          className,
        )}
        {...props}
        onInteractOutside={onInteractOutside}
      >
        <div className="mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & { variant?: 'default' | 'toolbar' }) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        variant === 'toolbar' &&
          'flex-row shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-5 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left group-data-[vaul-drawer-direction=top]/drawer-content:text-left md:px-6',
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  hidden,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title> & { hidden?: boolean }) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-copy font-semibold text-foreground', hidden && 'sr-only', className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
