import * as React from 'react';
import {
  PresentationSurface,
  usePresentationPolicy,
  usePresentationSurface,
  usePresentationFocus,
} from '../presentation-policy.tsx';
import { cn } from '../lib/utils.ts';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Button } from './button.tsx';

function Dialog({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  children,
  modal = true,
  ...props
}: Omit<DialogPrimitive.Root.Props, 'children'> & { children?: React.ReactNode }) {
  const [local, setLocal] = React.useState(defaultOpen);
  const open = controlled ?? local;
  const surface = usePresentationSurface(open);
  return (
    <PresentationSurface id={surface.id}>
      <DialogPrimitive.Root
        {...props}
        open={open}
        modal={surface.policy.bounded ? false : modal}
        onOpenChange={(next, details) => {
          if (!next && !surface.allowClose(details)) return;
          onOpenChange?.(next, details);
          if (!details.isCanceled) setLocal(next);
        }}
      >
        <DialogFocus open={open}>{children}</DialogFocus>
      </DialogPrimitive.Root>
    </PresentationSurface>
  );
}

const DialogFocusContext = React.createContext<(() => HTMLElement | undefined) | undefined>(
  undefined,
);
function DialogFocus({ open, children }: { open: boolean; children: React.ReactNode }) {
  const restore = usePresentationFocus(open);
  return <DialogFocusContext.Provider value={restore}>{children}</DialogFocusContext.Provider>;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  const policy = usePresentationPolicy();
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      {...props}
      container={policy.portal ?? props.container}
    />
  );
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  const policy = usePresentationPolicy();
  if (policy.bounded)
    return (
      <div
        data-slot="dialog-overlay"
        className="pointer-events-none fixed inset-0 z-50 bg-black/50"
      />
    );
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  initialFocus = true,
  finalFocus,
  ...props
}: DialogPrimitive.Popup.Props) {
  const restore = React.useContext(DialogFocusContext);
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'z-50 duration-200 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
          className,
        )}
        {...props}
        initialFocus={initialFocus}
        finalFocus={finalFocus ?? restore}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & { showCloseButton?: boolean }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
};
