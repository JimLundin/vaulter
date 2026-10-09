import { useFieldUnsupportedControl } from '../field-association.ts';
import * as React from 'react';
import { Autocomplete as CommandPrimitive } from '@base-ui/react/autocomplete';
import { cn } from '../lib/utils.ts';
import { SearchIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog.tsx';

type CommandContextValue = {
  query: string;
  change: (value: string) => void;
  shouldFilter: boolean;
  matches: (value: string, query: string) => boolean;
  visibleCount: number;
  register: (id: string) => () => void;
};
const CommandContext = React.createContext<CommandContextValue>({
  query: '',
  change: () => undefined,
  shouldFilter: true,
  matches: () => true,
  visibleCount: 0,
  register: () => () => undefined,
});
function Command({
  className,
  children,
  shouldFilter = true,
  loop = true,
  ...props
}: React.ComponentProps<'div'> & {
  shouldFilter?: boolean;
  loop?: boolean;
}) {
  const [query, change] = React.useState('');
  const { contains: matches } = CommandPrimitive.useFilter();
  const [visibleItems, setVisibleItems] = React.useState<Set<string>>(() => new Set());
  const register = React.useCallback((id: string) => {
    setVisibleItems((items) => new Set(items).add(id));
    return () =>
      setVisibleItems((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
  }, []);
  return (
    <CommandContext.Provider
      value={{ query, change, shouldFilter, matches, visibleCount: visibleItems.size, register }}
    >
      <CommandPrimitive.Root
        inline
        open
        mode="none"
        autoHighlight="always"
        keepHighlight
        loopFocus={loop}
        value={query}
        onValueChange={(next, details) => {
          if (details.reason !== 'item-press') change(next);
        }}
      >
        <div
          data-slot="command"
          className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </CommandPrimitive.Root>
    </CommandContext.Provider>
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn('overflow-hidden p-0', className)}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="**:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-group]:px-2 **:data-[slot=command-group-label]:px-2 **:data-[slot=command-group-label]:font-medium **:data-[slot=command-group-label]:text-muted-foreground [&_[data-slot=command-input-wrapper]_svg]:size-5 **:data-[slot=command-input]:h-12 **:data-[slot=command-item]:px-2 **:data-[slot=command-item]:py-3 [&_[data-slot=command-item]_svg]:size-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitive.Input>, 'value' | 'onChange'> & {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  useFieldUnsupportedControl();
  const context = React.useContext(CommandContext);
  React.useLayoutEffect(() => {
    if (value !== undefined) context.change(value);
  }, [value, context.query, context.change]);
  return (
    <div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        value={value}
        onChange={(event) => {
          context.change(event.currentTarget.value);
          onValueChange?.(event.currentTarget.value);
        }}
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-field outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      {...props}
    />
  );
}

function CommandEmpty({ children, ...props }: React.ComponentProps<'div'>) {
  const { visibleCount } = React.useContext(CommandContext);
  return (
    <div
      data-slot="command-empty"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="text-center text-sm not-empty:py-6"
      {...props}
    >
      {visibleCount === 0 ? children : null}
    </div>
  );
}

function CommandGroup({
  className,
  heading,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group> & { heading?: React.ReactNode }) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground not-has-[[data-slot=command-item]]:hidden',
        className,
      )}
      {...props}
    >
      {heading && (
        <CommandPrimitive.GroupLabel
          data-slot="command-group-label"
          className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
        >
          {heading}
        </CommandPrimitive.GroupLabel>
      )}
      {props.children}
    </CommandPrimitive.Group>
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  onSelect,
  onClick,
  value,
  children,
  ref: forwardedRef,
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitive.Item>, 'onSelect'> & {
  onSelect?: (value: string) => void;
}) {
  const context = React.useContext(CommandContext);
  const id = React.useId();
  const ref = React.useRef<HTMLDivElement>(null);
  const [text, setText] = React.useState<string | null>(
    typeof children === 'string' ? children.trim() : null,
  );
  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') {
        const cleanup = forwardedRef(node);
        return () => {
          ref.current = null;
          if (typeof cleanup === 'function') cleanup();
          else forwardedRef(null);
        };
      }
      if (forwardedRef) forwardedRef.current = node;
      return () => {
        ref.current = null;
        if (forwardedRef) forwardedRef.current = null;
      };
    },
    [forwardedRef],
  );
  React.useLayoutEffect(() => {
    if (ref.current && value === undefined) setText(ref.current.textContent?.trim() ?? '');
  });
  const itemValue = value ?? text ?? id;
  const visible =
    !context.shouldFilter ||
    (value === undefined && text === null) ||
    context.matches(String(itemValue), context.query.trim());
  React.useLayoutEffect(() => {
    if (visible) return context.register(id);
  }, [visible, context.register, id]);
  if (!visible) return null;
  return (
    <CommandPrimitive.Item
      ref={mergedRef}
      data-slot="command-item"
      value={itemValue}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.(String(itemValue));
      }}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        'ml-auto hidden text-xs tracking-widest text-muted-foreground md:block',
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
