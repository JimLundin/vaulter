import { useFieldUnsupportedControl } from '../field-association.ts';
import { cn } from '../lib/utils.ts';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

type ToggleGroupProps = Omit<
  ToggleGroupPrimitive.Props,
  'className' | 'value' | 'defaultValue' | 'onValueChange' | 'multiple' | 'loopFocus'
> & {
  className?: string;
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
      className={cn('flex w-fit items-center rounded-md', className)}
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
      {children}
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: Omit<TogglePrimitive.Props, 'className'> & { className?: string; value: string }) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-9 w-auto min-w-0 shrink-0 items-center justify-center gap-2 border border-input border-l-0 bg-transparent px-3 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus:z-10 focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-pressed:bg-accent data-pressed:text-accent-foreground dark:aria-invalid:ring-destructive/40 first:rounded-l-md first:border-l last:rounded-r-md [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
