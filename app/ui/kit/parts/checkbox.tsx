'use client';
import { useFieldUnsupportedControl } from '../field-association.ts';

import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

type CheckedState = boolean | 'indeterminate';
type CheckboxProps = Omit<
  CheckboxPrimitive.Root.Props,
  'checked' | 'defaultChecked' | 'onCheckedChange' | 'className'
> & {
  className?: string;
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
};

function Checkbox({
  className,
  checked,
  defaultChecked = false,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  useFieldUnsupportedControl();
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(defaultChecked);
  const state = checked ?? uncontrolledChecked;
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={state === true}
      indeterminate={state === 'indeterminate'}
      onCheckedChange={(nextChecked) => {
        setUncontrolledChecked(nextChecked);
        onCheckedChange?.(nextChecked);
      }}
      className={cn(
        'peer relative grid size-4 shrink-0 place-items-center bg-transparent before:absolute before:size-4 before:rounded-[4px] before:border before:border-input before:shadow-xs before:transition-colors transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:before:border-primary data-checked:before:bg-primary data-checked:text-primary-foreground dark:before:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:before:bg-primary',
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
