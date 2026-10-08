// One navigation, declared once as data and shown in the shape that fits the window — the idea of
// Material 3's NavigationSuiteScaffold and SwiftUI's sidebar-adaptable TabView. Two size classes:
//
//   expanded (≥768px)   a sidebar: brand and search field on top, destinations in the middle, actions
//                       and the primary action at the foot
//   compact (<768px)    a bottom bar: Menu, search and the actions as icons; the destinations in a menu
//                       sheet that rises from the bar; the primary action floating above the bar
//
// Destinations are places that can grow without limit (a note, history, a calendar); actions are the few
// controls every screen keeps (search, settings). Whatever a product adds goes in one of the two lists,
// and both shapes follow. The kit README's correspondence table lists every pair.
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';
import {
  Brand,
  Kbd,
  MobileActionButton,
  MobileBar,
  MobileHeader,
  NavigationSheet,
  SearchButton,
  Sidebar,
  SidebarMenu,
  WorkspaceFrame,
} from './app.tsx';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from './parts/sidebar.tsx';

/** A place: a sidebar row on desktop, a row in the menu sheet on a phone. */
export interface NavigationDestination {
  label: string;
  href: string;
  icon: IconName;
  current: boolean;
}

/** A control every screen keeps: a sidebar footer row on desktop, a bar icon on a phone. */
export interface NavigationAction {
  label: string;
  icon: IconName;
  /** A link, for an action that is also a screen (settings). */
  href?: string;
  onSelect?: () => void;
  keys?: string;
  current?: boolean;
  expanded?: boolean;
}

export function NavigationSuite({
  status,
  search,
  destinations,
  actions,
  primary,
  footer,
  aside,
  children,
}: {
  /** The sync status beside the brand. */
  status: ReactNode;
  /** The search field on desktop, the search icon on a phone. */
  search: { label: string; keys?: string; onSelect: () => void };
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  /** Optional primary controls: at the sidebar's foot and floating above the phone bar. A product
   * can supply only the phone control when the desktop destination already covers the action. */
  primary?: { expanded?: ReactNode; compact?: ReactNode };
  /** Account controls under everything else (sign out). */
  footer?: ReactNode;
  /** A panel beside the screen (desktop) or over it (phone). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const compact = useIsMobile();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!compact) setMenu(false);
  }, [compact]);
  // The footer stays finite as features grow. Further linked actions remain available in the menu.
  const barActions = actions.slice(0, 3);
  const menuEntries = [
    ...destinations,
    ...actions
      .slice(3)
      .flatMap((action) =>
        action.href ? [{ ...action, href: action.href, current: !!action.current }] : [],
      ),
  ];
  const onAction = barActions.some((action) => action.current);

  return (
    <SidebarProvider>
      {compact ? (
        <NavigationSheet
          open={menu}
          onClose={() => setMenu(false)}
          brand={<Brand status={status} />}
          entries={menuEntries.map((entry) => ({ ...entry, active: entry.current }))}
          footer={
            <>
              {actions
                .slice(3)
                .filter((action) => !action.href)
                .map((action) => (
                  <button
                    type="button"
                    data-touch-target=""
                    key={action.label}
                    onClick={() => {
                      setMenu(false);
                      action.onSelect?.();
                    }}
                    className="flex items-center gap-2 px-2 text-control"
                  >
                    <Icon name={action.icon} />
                    {action.label}
                  </button>
                ))}
              {footer}
            </>
          }
        />
      ) : (
        <Sidebar>
          <SidebarHeader>
            <Brand status={status} />
            <SearchButton
              label={search.label}
              name="Search"
              keys={search.keys}
              onClick={search.onSelect}
            />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {destinations.map((entry) => (
                <SidebarMenuItem key={entry.href}>
                  <SidebarMenuButton asChild={true} isActive={entry.current}>
                    <a href={entry.href} aria-current={entry.current ? 'page' : undefined}>
                      <Icon name={entry.icon} />
                      {entry.label}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              {actions.map((action) => (
                <SidebarMenuItem key={action.label}>
                  <SidebarMenuButton
                    aria-label={action.label}
                    aria-expanded={action.expanded}
                    asChild={!!action.href}
                    isActive={!!action.current}
                    onClick={action.href ? undefined : action.onSelect}
                  >
                    {action.href ? (
                      <a href={action.href} aria-current={action.current ? 'page' : undefined}>
                        <Icon name={action.icon} />
                        {action.label}
                      </a>
                    ) : (
                      <>
                        <Icon name={action.icon} />
                        <span className="flex-1">{action.label}</span>
                        {action.keys ? <Kbd>{action.keys}</Kbd> : null}
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {primary?.expanded}
            {footer}
          </SidebarFooter>
        </Sidebar>
      )}
      <WorkspaceFrame
        header={<MobileHeader status={status} />}
        bar={
          <MobileBar
            items={[
              <MobileActionButton
                key="menu"
                icon="list"
                label="Menu"
                expanded={menu}
                current={!onAction && menuEntries.some((entry) => entry.current)}
                onClick={() => setMenu(true)}
              />,
              <MobileActionButton
                key="search"
                icon="search"
                label="Search"
                onClick={search.onSelect}
              />,
              ...barActions.map((action) => (
                <MobileActionButton
                  key={action.label}
                  icon={action.icon}
                  label={action.label}
                  current={action.current}
                  expanded={action.expanded}
                  href={action.href}
                  onClick={action.href ? undefined : action.onSelect}
                />
              )),
            ]}
            floating={primary?.compact}
          />
        }
      >
        {children}
      </WorkspaceFrame>
      {aside}
    </SidebarProvider>
  );
}
