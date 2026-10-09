import * as React from 'react';
import {
  PresentationSurface,
  usePresentationPolicy,
  usePresentationSurface,
  usePresentationFocus,
} from '../presentation-policy.tsx';
import { cn } from '../lib/utils.ts';
import { XIcon } from 'lucide-react';
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

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
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

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
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
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const restore = React.useContext(DialogFocusContext);
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...props}
        initialFocus={true}
        finalFocus={restore}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-open:bg-accent data-open:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
