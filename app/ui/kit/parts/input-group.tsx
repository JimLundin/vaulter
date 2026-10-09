'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils.ts';

import { Button } from './button.tsx';
import { Input } from './input.tsx';
import { Textarea } from './textarea.tsx';

function InputGroup({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & { variant?: 'default' | 'composer' }) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group relative flex w-full min-w-0 items-center rounded-lg border border-input bg-background shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30',
        'min-h-11 has-[>textarea]:h-auto',
        'has-[>[data-align=inset-end]]:p-[var(--space-control)]',
        'has-[>[data-align=inset-end]]:[&>[data-slot=input-group-control]]:pr-[calc(var(--input-actions-width,0px)+var(--space-row))]',
        variant === 'composer' && 'rounded-2xl',

        // Variants based on alignment.
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

        // Focus state.
        'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50',

        // Error state.
        'has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',

        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-3',
        'inline-end': 'order-last pr-3',
        'inset-end':
          'absolute right-[var(--space-control)] bottom-[var(--space-control)] gap-[var(--space-control)] p-0',
        'block-start':
          'order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5 [.border-b]:pb-3',
        'block-end':
          'order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5 [.border-t]:pt-3',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (align !== 'inset-end' || !ref.current) return;
    const addon = ref.current;
    const group = addon.parentElement;
    const measure = () =>
      group?.style.setProperty('--input-actions-width', `${addon.offsetWidth}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(addon);
    return () => {
      observer.disconnect();
      group?.style.removeProperty('--input-actions-width');
    };
  }, [align]);
  return (
    <div
      ref={ref}
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
          ?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'compact',
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type={type}
      size={size}
      variant={variant}
      className={cn('shadow-none', className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'h-11 flex-1 rounded-md border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-slot="input-group-control"
      variant={variant}
      className={cn(
        'flex-1 resize-none rounded-md border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
