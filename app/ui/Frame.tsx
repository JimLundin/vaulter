// The product's frame: its navigation, given to the kit's NavigationSuite, which shows it as a sidebar on
// desktop and as a bottom bar, menu sheet and floating primary action on a phone.
import type { ReactNode } from 'react';
import {
  Button,
  ConversationPanel,
  KeyHint,
  NavigationSuite,
  Text,
  Toaster,
  TooltipProvider,
} from './kit/index.ts';
import type { Navigation } from './command.ts';
import { link, useRoute } from './routing.ts';
import { later } from './later.ts';

export function Frame({
  navigation,
  status,
  failed,
  signOut,
  onSearch,
  primary,
  panel,
  closePanel,
  children,
}: {
  navigation: Navigation[];
  status: string;
  failed: boolean;
  signOut: (() => Promise<void>) | null;
  onSearch: () => void;
  /** The primary action: at the sidebar's foot on desktop, floating above the bar on a phone. */
  primary?: { expanded: ReactNode; compact: ReactNode };
  panel?: ReactNode;
  closePanel: () => void;
  children: ReactNode;
}) {
  const route = useRoute();
  const current = (href: string) =>
    route.path === href || (route.path === '/' && href === '/agent/');
  const place = (entry: Navigation) => ({
    label: entry.label,
    href: link(entry.href),
    icon: entry.icon ?? 'file',
    current: current(entry.href),
  });
  return (
    <TooltipProvider>
      <NavigationSuite
        status={
          <Text size="xs" tone={failed ? 'danger' : 'subtle'}>
            {status}
          </Text>
        }
        search={{ label: 'Search or ask…', keys: '⌘K', onSelect: onSearch }}
        destinations={navigation.filter((entry) => entry.kind !== 'action').map(place)}
        actions={navigation.filter((entry) => entry.kind === 'action').map(place)}
        primary={primary}
        footer={
          !!signOut && (
            <Button variant="ghost" size="sm" onClick={() => later(signOut())}>
              Sign out
            </Button>
          )
        }
        hints={
          <>
            <KeyHint keys="⌘K" label="Search" />
            <KeyHint keys="⌘J" label="Ask" />
            <KeyHint keys="?" label="Shortcuts" />
          </>
        }
        aside={
          <ConversationPanel open={!!panel} onClose={closePanel}>
            {panel}
          </ConversationPanel>
        }
      >
        {children}
      </NavigationSuite>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
