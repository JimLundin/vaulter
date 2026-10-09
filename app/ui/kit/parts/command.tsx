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
};
const CommandContext = React.createContext<CommandContextValue>({
  query: '',
  change: () => undefined,
  shouldFilter: true,
});
function Command({
  className,
  children,
  shouldFilter = true,
  loop = true,
  ...props
}: React.ComponentProps<'div'> & { shouldFilter?: boolean; loop?: boolean }) {
  const [query, change] = React.useState('');
  return (
    <CommandContext.Provider value={{ query, change, shouldFilter }}>
      <CommandPrimitive.Root
        inline
        open
        mode="none"
        autoHighlight="always"
        keepHighlight
        loopFocus={loop}
        value={query}
        onValueChange={change}
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
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('overflow-hidden p-0', className)}
        showCloseButton={showCloseButton}
      >
        <Command className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
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
  }, [value, context.change]);
  return (
    <div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
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

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
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
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {heading && (
        <CommandPrimitive.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
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
  value,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & { onSelect?: (value: string) => void }) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      value={value ?? (typeof children === 'string' ? children : undefined)}
      onClick={(event) => {
        props.onClick?.(event);
        onSelect?.(String(value ?? ''));
      }}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
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
