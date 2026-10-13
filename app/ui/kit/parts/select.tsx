import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useFieldSelectAssociation } from '../field-association.ts';
import { cn } from '../lib/utils.ts';

type SelectProps = Omit<React.ComponentProps<'select'>, 'children'> & {
  options: readonly { value: string; label: string }[];
  children?: never;
};

/** Native selection keeps the platform's keyboard navigation and phone picker. */
function Select({ className, options, ...props }: SelectProps) {
  const association = useFieldSelectAssociation(props);
  return (
    <div data-slot="select-wrapper" className="relative w-full min-w-0">
      <select
        data-slot="select"
        className={cn(
          'peer h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-field shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
        {...association}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </div>
  );
}

export { Select };
