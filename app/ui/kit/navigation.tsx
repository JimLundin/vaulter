// Declare destinations and app actions once. The kit owns sidebar and compact edge-rail placement.
import { type ReactNode, useState } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';
import { MobileEdgeRail } from './mobile-edge-rail.tsx';
import { PageControlsContext, usePageControls } from './page-controls.tsx';
import { Button } from './parts/button.tsx';
import { Brand, Kbd, SearchButton, Sidebar, SidebarMenu, WorkspaceFrame } from './app.tsx';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from './parts/sidebar.tsx';

/** A module destination: a sidebar row on desktop and a Modules menu item on a phone. */
export interface NavigationDestination {
  label: string;
  href: string;
  icon: IconName;
  current: boolean;
}

/** An app action, retained in the sidebar or the compact Modules menu. */
export interface NavigationAction {
  label: string;
  icon: IconName;
  href?: string;
  onSelect?: () => void;
  keys?: string;
  current?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  placement?: 'status' | 'header' | 'footer';
}

export function NavigationSuite({
  status,
  search,
  onNavigate,
  destinations,
  actions,
  primary,
  brandActions,
  footer,
  aside,
  children,
}: {
  status: ReactNode;
  /** Global search, distinct from the current module's collection search. */
  search: { label: string; keys?: string; onSelect: () => void };
  onNavigate?: () => void;
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  primary?: { expanded?: ReactNode; menu?: NavigationAction };
  /** Core task controls beside the brand and status, in both arrangements. */
  brandActions?: (menu: boolean) => ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const compact = useLayout() === 'compact';
  const pageControls = usePageControls(compact);
  const [openSearch, setOpenSearch] = useState<string | null>(null);
  const [clearance, setClearance] = useState(172);
  const registeredSearch = pageControls.search;
  const pageSearch = registeredSearch?.search
    ? { id: registeredSearch.id, ...registeredSearch.search }
    : undefined;
  const searchVisible = !!(compact && pageSearch && openSearch === pageSearch.id);
  const statusAction = actions.find((action) => action.placement === 'status');
  const settings = actions.find((action) => action.icon === 'settings');
  const headerActions = actions.filter(
    (action) => action.placement === 'header' || action === settings,
  );
  const otherActions = actions.filter(
    (action) => action !== statusAction && !headerActions.includes(action),
  );

  return (
    <PageControlsContext.Provider value={pageControls.context}>
      <SidebarProvider>
        {!compact && (
          <Sidebar data-app-navigation="">
            <SidebarHeader>
              <Brand
                status={status}
                statusAction={statusAction}
                actions={
                  <>
                    {headerActions.map((action) => (
                      <Button
                        key={action.label}
                        variant="ghost"
                        size="standard"
                        iconOnly={true}
                        aria-label={action.label}
                        aria-expanded={action.expanded}
                        title={action.label}
                        disabled={action.disabled}
                        render={action.href ? <a href={action.href}>{action.label}</a> : undefined}
                        onClick={action.href ? undefined : action.onSelect}
                      >
                        <Icon name={action.icon} />
                      </Button>
                    ))}
                    {brandActions?.(false)}
                  </>
                }
              />
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
                    <SidebarMenuButton
                      render={
                        <a
                          href={entry.href}
                          aria-label={entry.label}
                          aria-current={entry.current ? 'page' : undefined}
                        />
                      }
                      isActive={entry.current}
                      onClick={onNavigate}
                    >
                      <Icon name={entry.icon} />
                      {entry.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                {otherActions.map((action) => (
                  <SidebarMenuItem key={action.label}>
                    <SidebarMenuButton
                      aria-label={action.label}
                      aria-expanded={action.expanded}
                      disabled={action.disabled}
                      render={
                        action.href ? (
                          // biome-ignore lint/a11y/useAnchorContent: useRender supplies the SidebarMenuButton children to this anchor.
                          <a
                            href={action.href}
                            aria-label={action.label}
                            aria-current={action.current ? 'page' : undefined}
                          />
                        ) : undefined
                      }
                      isActive={!!action.current}
                      onClick={action.href ? undefined : action.onSelect}
                    >
                      <Icon name={action.icon} />
                      <span className="flex-1">{action.label}</span>
                      {!action.href && action.keys ? <Kbd>{action.keys}</Kbd> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
              {primary?.expanded}
              {footer}
            </SidebarFooter>
          </Sidebar>
        )}
        <WorkspaceFrame bar={null} pageControlsClearance={clearance}>
          {children}
        </WorkspaceFrame>
        {aside}
        <MobileEdgeRail
          compact={compact}
          status={status}
          destinations={destinations}
          actions={actions.filter((action) => action !== settings && action !== statusAction)}
          statusAction={statusAction}
          settings={settings}
          brandActions={brandActions}
          pageActions={pageControls.actions}
          pageSearch={pageSearch}
          pageFilters={pageControls.filters}
          searchVisible={searchVisible}
          onSearchOpen={() => setOpenSearch(pageSearch?.id ?? null)}
          onSearchClose={() => setOpenSearch(null)}
          onClearance={setClearance}
          onSearch={search.onSelect}
          onNavigate={onNavigate}
          primary={primary?.menu}
          footer={footer}
        />
      </SidebarProvider>
    </PageControlsContext.Provider>
  );
}
