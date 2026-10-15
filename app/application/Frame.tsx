// The product's frame: its navigation, given to the kit's NavigationSuite, which shows it as a sidebar on
// desktop and as a freestanding edge rail on a phone.
import type { ReactNode } from 'react';
import { NavigationSuite, Toaster, TooltipProvider } from '../ui/kit/index.ts';
import type { NavigationAction } from '../ui/kit/index.ts';
import type { Navigation } from '../navigation/commands.ts';
import { link, useRoute } from '../navigation/routing.ts';

export function Frame({
  navigation,
  status,
  signOut,
  onSearch,
  onNavigate,
  primary,
  panel,
  children,
}: {
  navigation: Navigation[];
  status: ReactNode;
  signOut: ReactNode;
  onSearch: () => void;
  onNavigate?: () => void;
  /** Optional primary task: sidebar content and/or a compact Tools action. */
  primary?: { expanded?: ReactNode; menu?: NavigationAction };
  panel?: ReactNode;
  children: ReactNode;
}) {
  const route = useRoute();
  const current = (href: string) =>
    route.path === href || (route.path === '/' && href === '/chat/');
  const place = (entry: Navigation) => ({
    label: entry.label,
    href: link(entry.href),
    icon: entry.icon ?? 'file',
    current: entry.current ?? current(entry.href),
  });
  return (
    <TooltipProvider>
      <NavigationSuite
        status={status}
        search={{ label: 'Search or ask…', keys: '⌘K', onSelect: onSearch }}
        onNavigate={onNavigate}
        destinations={navigation.filter((entry) => entry.kind !== 'action').map(place)}
        actions={navigation
          .filter((entry) => entry.kind === 'action')
          .map((entry) => ({
            ...place(entry),
            href: entry.onSelect ? undefined : link(entry.href),
            onSelect: entry.onSelect,
            current: entry.current ?? current(entry.href),
            expanded: entry.expanded,
          }))}
        primary={primary}
        footer={signOut}
        aside={panel}
      >
        {children}
      </NavigationSuite>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
