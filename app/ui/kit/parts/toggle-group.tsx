import { useFieldUnsupportedControl } from '../field-association.ts';
import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils.ts';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

import { toggleVariants } from './toggle.tsx';

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 0,
});

type ToggleGroupProps = Omit<
  ToggleGroupPrimitive.Props,
  'className' | 'value' | 'defaultValue' | 'onValueChange' | 'multiple' | 'loopFocus'
> &
  VariantProps<typeof toggleVariants> & {
    className?: string;
    spacing?: number;
    loop?: boolean;
    rovingFocus?: boolean;
  } & (
    | {
        type: 'single';
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
      }
    | {
        type: 'multiple';
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
      }
  );

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  type,
  value,
  defaultValue,
  onValueChange,
  loop = true,
  rovingFocus: _rovingFocus,
  ...props
}: ToggleGroupProps) {
  useFieldUnsupportedControl();
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
        className,
      )}
      {...props}
      multiple={type === 'multiple'}
      value={
        value === undefined ? undefined : typeof value === 'string' ? (value ? [value] : []) : value
      }
      defaultValue={
        defaultValue === undefined
          ? undefined
          : typeof defaultValue === 'string'
            ? defaultValue
              ? [defaultValue]
              : []
            : defaultValue
      }
      loopFocus={loop}
      onValueChange={(nextValue) => {
        if (type === 'single') onValueChange?.(nextValue[0] ?? '');
        else onValueChange?.(nextValue);
      }}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: Omit<TogglePrimitive.Props, 'className'> & { className?: string; value: string } & VariantProps<
    typeof toggleVariants
  >) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        'w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10',
        'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
