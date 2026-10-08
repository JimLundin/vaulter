// Direct composition of the kit's desktop and mobile frames.
import type { ComponentProps, ReactNode } from 'react';
import {
  Brand,
  Button,
  DesktopMain,
  Icon,
  KeyHint,
  MobileBar,
  MobileFrame,
  Overlay,
  RoundButton,
  Row,
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
  ThemeSwitch,
  Toaster,
  TooltipProvider,
  useIsMobile,
  useSidebar,
  SidePanel,
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
  panel?: ReactNode;
  closePanel: () => void;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const wide = useMedia('(min-width: 1280px)');
  const route = useRoute();
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <Brand />
            <SearchButton label="Search or ask…" keys="⌘K" onClick={onSearch} />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navigation.map((entry) => (
                <SidebarMenuItem key={entry.href}>
                  <SidebarMenuButton
                    asChild={true}
                    isActive={
                      route.path === entry.href || (route.path === '/' && entry.href === '/agent/')
                    }
                  >
                    <NavigationLink href={entry.href}>
                      <Icon name={entry.icon ?? 'file'} />
                      {entry.label}
                    </NavigationLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            {actions}
            <Text size="xs" tone={failed ? 'danger' : 'subtle'}>
              {status}
            </Text>
            <Row justify="between">
              <ThemeSwitch />
              {!!signOut && (
                <Button variant="ghost" size="sm" onClick={() => later(signOut())}>
                  Sign out
                </Button>
              )}
            </Row>
          </SidebarFooter>
        </Sidebar>
        {mobile ? (
          <MobileFrame
            bar={
              <MobileBar
                left={<RoundButton icon="search" label="Search" onClick={onSearch} />}
                center={mobileAction}
                right={<MenuButton />}
              />
            }
          >
            {children}
          </MobileFrame>
        ) : (
          <DesktopMain
            hints={
              <>
                <KeyHint keys="⌘K" label="Search" />
                <KeyHint keys="⌘J" label="Ask" />
                <KeyHint keys="?" label="Shortcuts" />
              </>
            }
          >
            {children}
          </DesktopMain>
        )}
        {panel && wide ? (
          <SidePanel title="Agent" onClose={closePanel}>
            {panel}
          </SidePanel>
        ) : (
          <Overlay
            mobile={mobile}
            open={!!panel}
            onClose={closePanel}
            title="Ask the agent"
            tall={true}
          >
            {panel}
          </Overlay>
        )}
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
function MenuButton() {
  const { setOpenMobile } = useSidebar();
  return <RoundButton icon="list" label="Menu" onClick={() => setOpenMobile(true)} />;
}

function NavigationLink({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <a
      {...props}
      href={link(href)}
      onClick={(event) => {
        onClick?.(event);
        setOpenMobile(false);
      }}
    />
  );
}
