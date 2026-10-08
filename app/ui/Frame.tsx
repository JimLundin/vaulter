// Direct composition of the kit's desktop and mobile frames.
import type { ReactNode } from 'react';
import {
  Brand,
  Button,
  Icon,
  KeyHint,
  MobileBar,
  MobileHeader,
  NavigationSheet,
  WorkspaceFrame,
  ConversationPanel,
  MobileActionButton,
  SearchButton,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  Text,
  Toaster,
  TooltipProvider,
  useIsMobile,
} from './kit/index.ts';
import { useEffect, useState } from 'react';
import type { Navigation } from './command.ts';
import { link, useRoute } from './routing.ts';
import { later } from './later.ts';

export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const changed = () => setMatches(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, [query]);
  return matches;
}

export function Frame({
  navigation,
  status,
  failed,
  signOut,
  onSearch,
  actions,
  mobileAction,
  mobileNavigation,
  panel,
  closePanel,
  children,
}: {
  navigation: Navigation[];
  status: string;
  failed: boolean;
  signOut: (() => Promise<void>) | null;
  onSearch: () => void;
  actions?: ReactNode;
  mobileAction?: ReactNode;
  mobileNavigation?: ReactNode;
  panel?: ReactNode;
  closePanel: () => void;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const wide = useMedia('(min-width: 1280px)');
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!mobile) setMenu(false);
  }, [mobile]);
  const statusText = (
    <Text size="xs" tone={failed ? 'danger' : 'subtle'}>
      {status}
    </Text>
  );
  const active = (href: string) =>
    route.path === href || (route.path === '/' && href === '/agent/');
  return (
    <TooltipProvider>
      <SidebarProvider>
        {mobile ? (
          <NavigationSheet
            open={menu}
            onClose={() => setMenu(false)}
            brand={<Brand status={statusText} />}
            entries={navigation.map((entry) => ({
              ...entry,
              href: link(entry.href),
              icon: entry.icon ?? 'file',
              active: active(entry.href),
            }))}
            footer={
              !!signOut && (
                <Button variant="ghost" onClick={() => later(signOut())}>
                  Sign out
                </Button>
              )
            }
          />
        ) : (
          <Sidebar>
            <SidebarHeader>
              <Brand status={statusText} />
              <SearchButton label="Search or ask…" keys="⌘K" onClick={onSearch} />
            </SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                {navigation.map((entry) => (
                  <SidebarMenuItem key={entry.href}>
                    <SidebarMenuButton asChild={true} isActive={active(entry.href)}>
                      <a href={link(entry.href)}>
                        <Icon name={entry.icon ?? 'file'} />
                        {entry.label}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter>
              {actions}
              {!!signOut && (
                <Button variant="ghost" size="sm" onClick={() => later(signOut())}>
                  Sign out
                </Button>
              )}
            </SidebarFooter>
          </Sidebar>
        )}
        <WorkspaceFrame
          header={<MobileHeader status={statusText} />}
          bar={
            <MobileBar
              left={<MobileActionButton icon="search" label="Search" onClick={onSearch} />}
              center={mobileNavigation}
              floating={mobileAction}
              right={<MobileActionButton icon="list" label="Menu" onClick={() => setMenu(true)} />}
            />
          }
          hints={
            <>
              <KeyHint keys="⌘K" label="Search" />
              <KeyHint keys="⌘J" label="Ask" />
              <KeyHint keys="?" label="Shortcuts" />
            </>
          }
        >
          {children}
        </WorkspaceFrame>
        <ConversationPanel mobile={mobile} wide={wide} open={!!panel} onClose={closePanel}>
          {panel}
        </ConversationPanel>
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
