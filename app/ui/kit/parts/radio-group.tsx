import type { ComponentProps } from 'react';
import { RadioGroup as Primitive } from 'radix-ui';
import { cn } from '../lib/utils.ts';

function RadioGroup({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof Primitive.Root> & { variant?: 'default' | 'choices' | 'segmented' }) {
  return (
    <Primitive.Root
      {...props}
      data-slot="radio-group"
      data-variant={variant}
      className={cn(
        'group/radio-group',
        variant === 'segmented'
          ? 'flex items-center gap-1 rounded-lg border p-1'
          : variant === 'choices'
            ? 'flex flex-col divide-y border-y md:flex-row md:flex-wrap md:gap-1 md:divide-y-0 md:rounded-lg md:border md:p-1'
            : 'flex flex-col gap-2',
        className,
      )}
    />
  );
}
function RadioGroupItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      {...props}
      data-slot="radio-group-item"
      data-touch-target=""
      className={cn(
        'flex min-h-12 w-full items-center gap-2 px-2 text-left text-label focus-visible:outline-2 focus-visible:outline-ring hover:bg-muted md:min-h-9 md:w-auto md:flex-1 md:justify-center md:rounded-md md:data-[state=checked]:bg-muted md:data-[state=checked]:font-medium',
        'group-data-[variant=segmented]/radio-group:min-h-8 group-data-[variant=segmented]/radio-group:w-auto group-data-[variant=segmented]/radio-group:rounded-md group-data-[variant=segmented]/radio-group:px-3 group-data-[variant=segmented]/radio-group:data-[state=checked]:bg-muted group-data-[variant=segmented]/radio-group:data-[state=checked]:font-medium',
        className,
      )}
    />
  );
}
function RadioGroupIndicator({ className, ...props }: ComponentProps<typeof Primitive.Indicator>) {
  return (
    <Primitive.Indicator
      {...props}
      data-slot="radio-group-indicator"
      className={cn('ml-auto md:hidden', className)}
    />
  );
}
export { RadioGroup, RadioGroupItem, RadioGroupIndicator };
