// The sidebar: home and every page the extensions add (with their icons and badges), the groups they
// add under them (areas, recent notes), and the theme and sign-out. Collapses to icons (⌘B); on a phone
// it's a sheet, opened from the bottom bar's Menu, and closes when a page is picked.
import { useEffect } from 'react';
import { HouseIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useHost, navOf } from './host.tsx';
import { link, useRoute } from './route.ts';
import type { Status } from './session.ts';
import { type Theme, useTheme } from './theme.ts';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';

const THEMES: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

const time = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** The sync state in a few words. */
export const syncLabel = (s: Status) =>
  s.kind === 'syncing'
    ? 'Syncing…'
    : s.kind === 'synced'
      ? `Synced ${time(s.at)}`
      : s.kind === 'offline'
        ? 'Offline'
        : s.kind === 'error'
          ? 'Sync failed'
          : '';

export function AppSidebar({
  status,
  signOut,
}: {
  status: Status;
  signOut: (() => Promise<void>) | null;
}) {
  const host = useHost();
  const { path } = useRoute();
  const { setOpenMobile } = useSidebar();
  const [theme, setTheme] = useTheme();
  // A page picked on a phone closes the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: path is the trigger, not something the effect reads
  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);
  const pages = [
    { label: 'Home', href: '/', icon: HouseIcon, count: undefined as number | undefined },
    ...navOf(host).map((n) => ({ ...n, count: n.badge?.(host) })),
  ];
  const sections = host.extensions
    .flatMap((e) => (e.sidebar ?? []).map((s, i) => ({ ...s, key: `${e.id}.${i}` })))
    .sort((a, b) => a.order - b.order);
  const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? MonitorIcon;
  const failed = status.kind === 'error' || status.kind === 'offline';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild={true} size="lg" tooltip="Vault">
              <a href={link('/')} className="no-underline">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
                  V
                </span>
                <span className="grid leading-tight">
                  <span className="font-semibold text-foreground">Vault</span>
                  <span
                    className={failed ? 'text-destructive text-xs' : 'text-faint text-xs'}
                    title={status.kind === 'error' ? status.message : undefined}
                  >
                    {syncLabel(status)}
                  </span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {pages.map((n) =>
                n.count === 0 ? null : (
                  <SidebarMenuItem key={n.href}>
                    <SidebarMenuButton
                      asChild={true}
                      tooltip={n.label}
                      isActive={n.href === '/' ? path === '/' : path.startsWith(n.href)}
                    >
                      <a href={link(n.href)} className="text-sidebar-foreground no-underline">
                        {!!n.icon && <n.icon />}
                        <span>{n.label}</span>
                      </a>
                    </SidebarMenuButton>
                    {!!n.count && <SidebarMenuBadge>{n.count}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {sections.map(({ view: V, key }) => (
          <V key={key} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild={true}>
                <SidebarMenuButton tooltip="Theme">
                  <ThemeIcon />
                  <span>Theme: {THEMES.find((t) => t.value === theme)?.label}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                  {THEMES.map((t) => (
                    <DropdownMenuRadioItem key={t.value} value={t.value}>
                      {t.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          {!!signOut && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" onClick={signOut}>
                <LogOutIcon />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
