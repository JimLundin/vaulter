import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/kit/lib/utils.ts';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { useLayout } from '../hooks/use-layout.ts';
import { Icon, type IconName } from '../icons.tsx';

// Responsive sizes change hit targets immediately; only visual feedback should animate.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        filled: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        suggestion: 'kit-prompt-suggestion',
        inline: 'kit-inline-action',
      },
      // Visual sizes; styles.css gives every standalone control a 44px touch target.
      size: {
        standard: 'h-11 px-4 py-2 has-[>svg]:px-3',
        compact: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
      },
      iconOnly: { true: 'aspect-square p-0 has-[>svg]:p-0', false: '' },
    },
    defaultVariants: {
      variant: 'filled',
      size: 'standard',
      iconOnly: false,
    },
  },
);

function Button({
  className,
  variant = 'filled',
  size = 'standard',
  iconOnly = false,
  pending = false,
  compactIcon,
  children,
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof buttonVariants> & {
    pending?: boolean;
    /** Replace the label with this icon on compact layouts; supply an accessible label. */
    compactIcon?: IconName;
  }) {
  const compact = useLayout() === 'compact';
  const showCompactIcon = compact && !!compactIcon;
  const square = iconOnly || showCompactIcon;
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={variant === 'inline' ? undefined : size}
      data-icon-only={square || undefined}
      className={cn(
        variant === 'inline'
          ? cn('kit-inline-action', className)
          : buttonVariants({ variant, size, iconOnly: square, className }),
        pending && 'animate-pulse',
      )}
      {...props}
    >
      {showCompactIcon ? <Icon name={compactIcon!} /> : children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
