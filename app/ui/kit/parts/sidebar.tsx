'use client';

import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';

import { buttonVariants } from './button.tsx';
import { Input } from './input.tsx';
import { Separator } from './separator.tsx';
import { Skeleton } from './skeleton.tsx';

const SIDEBAR_WIDTH = '16rem';

/** Shared workspace wrapper and width token; phone Menu state belongs to NavigationSuite. */
function SidebarProvider({ className, style, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-wrapper"
      style={{ '--sidebar-width': SIDEBAR_WIDTH, ...style } as React.CSSProperties}
      className={cn('flex min-h-svh w-full', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Expanded left navigation, also usable inside a bounded catalogue canvas. */
function Sidebar({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar"
      className={cn(
        'flex h-full w-(--sidebar-width) shrink-0 flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
      {...props}
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        className="flex h-full w-full flex-col bg-sidebar"
      >
        {children}
      </div>
    </div>
  );
}

/** Generic content wrapper; inset-only outer appearance has been retired. */
function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('relative flex w-full flex-1 flex-col bg-background', className)}
      {...props}
    />
  );
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn('h-8 w-full bg-background shadow-none', className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto', className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn(
        'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-y-[var(--space-row)] p-2',
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupLabel({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    render,
    state: { slot: 'sidebar-group-label', sidebar: 'group-label' },
    props: mergeProps<'div'>(
      {
        className: cn(
          'col-start-1 row-start-1 flex min-h-[var(--control-size)] min-w-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
          className,
        ),
      },
      props,
    ),
  });
}

function SidebarGroupAction({ className, render, ...props }: useRender.ComponentProps<'button'>) {
  return useRender({
    defaultTagName: 'button',
    render,
    state: { slot: 'sidebar-group-action', sidebar: 'group-action' },
    props: mergeProps<'button'>(
      {
        className: cn(
          buttonVariants({ variant: 'filled', size: 'compact', iconOnly: true }),
          'col-start-2 row-start-1 size-[var(--control-size)]',
          className,
        ),
      },
      props,
    ),
  });
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('col-span-2 w-full min-w-0 text-sm', className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn(
        'group/menu-item relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-[var(--space-control)] gap-y-[var(--space-control)]',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuButton({
  render,
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<'button'> & {
  isActive?: boolean;
}) {
  return useRender({
    defaultTagName: 'button',
    render,
    state: { slot: 'sidebar-menu-button', sidebar: 'menu-button', active: isActive },
    stateAttributesMapping: { active: (value) => ({ 'data-active': String(value) }) },
    props: mergeProps<'button'>(
      {
        className: cn(
          'peer/menu-button col-start-1 row-start-1 flex h-8 min-w-0 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
          className,
        ),
      },
      props,
    ),
  });
}

function SidebarMenuAction({ className, render, ...props }: useRender.ComponentProps<'button'>) {
  return useRender({
    defaultTagName: 'button',
    render,
    state: { slot: 'sidebar-menu-action', sidebar: 'menu-action' },
    props: mergeProps<'button'>(
      {
        className: cn(
          buttonVariants({ variant: 'ghost', size: 'compact', iconOnly: true }),
          'col-start-3 row-start-1 size-[var(--control-size)] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          className,
        ),
      },
      props,
    ),
  });
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        'pointer-events-none col-start-2 row-start-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
        'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn(
        'col-span-3 flex h-[var(--control-size)] items-center gap-2 rounded-md px-2',
        className,
      )}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'col-span-3 ml-4 flex min-w-0 flex-col gap-1 border-l border-sidebar-border pl-2 py-1',
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<'a'> & {
  isActive?: boolean;
}) {
  return useRender({
    defaultTagName: 'a',
    render,
    state: {
      slot: 'sidebar-menu-sub-button',
      sidebar: 'menu-sub-button',
      active: isActive,
    },
    stateAttributesMapping: { active: (value) => ({ 'data-active': String(value) }) },
    props: mergeProps<'a'>(
      {
        className: cn(
          'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
          'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
          'text-sm',
          className,
        ),
      },
      props,
    ),
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
};
