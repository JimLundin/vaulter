import type { ComponentProps } from 'react';
import { RadioGroup as Primitive } from 'radix-ui';
import { cn } from '../lib/utils.ts';

function RadioGroup({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof Primitive.Root> & { variant?: 'default' | 'choices' }) {
  return (
    <Primitive.Root
      {...props}
      data-slot="radio-group"
      className={cn(
        variant === 'choices'
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
