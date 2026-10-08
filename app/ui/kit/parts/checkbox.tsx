'use client';

import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative grid size-4 shrink-0 place-items-center bg-transparent before:absolute before:size-4 before:rounded-[4px] before:border before:border-input before:shadow-xs before:transition-colors transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:before:border-primary data-[state=checked]:before:bg-primary data-[state=checked]:text-primary-foreground dark:before:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:before:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
