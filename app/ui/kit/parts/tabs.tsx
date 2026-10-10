import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

const TabsActivationContext = React.createContext<'automatic' | 'manual'>('automatic');

function Tabs({
  className,
  activationMode = 'automatic',
  onValueChange,
  children,
  ...props
}: Omit<TabsPrimitive.Root.Props, 'className' | 'onValueChange' | 'orientation'> & {
  className?: string;
  activationMode?: 'automatic' | 'manual';
  onValueChange?: (value: string) => void;
}) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation="horizontal"
      orientation="horizontal"
      className={cn('flex flex-col gap-2', className)}
      {...props}
      onValueChange={(value) => {
        if (typeof value === 'string') onValueChange?.(value);
      }}
    >
      <TabsActivationContext.Provider value={activationMode}>
        {children}
      </TabsActivationContext.Provider>
    </TabsPrimitive.Root>
  );
}

function TabsList({
  className,
  loop = true,
  ...props
}: Omit<TabsPrimitive.List.Props, 'className' | 'loopFocus'> & {
  className?: string;
  loop?: boolean;
}) {
  const activationMode = React.useContext(TabsActivationContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground',
        className,
      )}
      activateOnFocus={activationMode === 'automatic'}
      loopFocus={loop}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: Omit<TabsPrimitive.Tab.Props, 'className'> & { className?: string }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-active:shadow-sm dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  forceMount,
  ...props
}: Omit<TabsPrimitive.Panel.Props, 'className' | 'keepMounted'> & {
  className?: string;
  forceMount?: true;
}) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      keepMounted={forceMount}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
