// The frame around every page: the sidebar, a slim header (the page's title, search, the panels), the
// page, and the panel beside it (the agent) — docked on a wide screen, a sheet on a tablet, a drawer from
// the bottom on a phone, where a bottom bar puts Home, the tab pages, the panel, search and the menu
// under a thumb. Every command's keys are bound here, and ⌘K, the shortcuts list and the toasts live here.
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { HouseIcon, KeyboardIcon, MenuIcon, PanelLeftIcon, SearchIcon, XIcon } from 'lucide-react';
import { cn } from 'cn';
import type { Command, Extension, Page } from './extension.ts';
import { useHost, navOf } from './host.tsx';
import { useKeys } from './keys.ts';
import { later } from './later.ts';
import { opened } from './recent.ts';
import { go, link, useRoute } from './route.ts';
import type { Status } from './session.ts';
import { setTheme } from './theme.ts';
import { AppSidebar, syncLabel } from './AppSidebar.tsx';
import { Keys, Search } from './Search.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer.tsx';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet.tsx';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar.tsx';
import { Toaster } from '@/components/ui/sonner.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';

type Panel = NonNullable<Extension['panel']>;

const WIDE = '(min-width: 1280px)';
const PHONE = '(max-width: 767px)';
function useMedia(q: string) {
  const [on, set] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => set(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return on;
}

/** The shell's own commands, the pages' go-tos and the panels', then the extensions'. */
function useCommands(signOut: (() => Promise<void>) | null): Command[] {
  const host = useHost();
  return useMemo(() => {
    const pages: Command[] = [
      {
        id: 'go.home',
        label: 'Home',
        group: 'Go to',
        icon: HouseIcon,
        keys: 'g h',
        run: () => go('/'),
      },
      ...navOf(host).map((n) => ({
        id: `go.${n.href}`,
        label: n.label,
        group: 'Go to',
        icon: n.icon,
        keys: n.keys,
        run: () => go(n.href),
      })),
    ];
    const panels: Command[] = host.extensions.flatMap((e) =>
      e.panel && (!e.panel.when || e.panel.when(host))
        ? [
            {
              id: `panel.${e.panel.id}`,
              label: `Open or close ${e.panel.label.toLowerCase()}`,
              group: 'Actions',
              icon: e.panel.icon,
              keys: e.panel.keys,
              run: () => host.ui.togglePanel(e.panel!.id),
            },
          ]
        : [],
    );
    const shell: Command[] = [
      {
        id: 'search',
        label: 'Search',
        group: 'Actions',
        keys: 'mod+k',
        hidden: true,
        run: () => host.ui.setSearch(true),
      },
      {
        id: 'search.slash',
        label: 'Search',
        group: 'Actions',
        keys: '/',
        hidden: true,
        run: () => host.ui.setSearch(true),
      },
      {
        id: 'help',
        label: 'Keyboard shortcuts',
        group: 'Actions',
        icon: KeyboardIcon,
        keys: '?',
        run: () => host.ui.setHelp(true),
      },
      {
        id: 'sidebar',
        label: 'Show or hide the sidebar',
        group: 'Actions',
        icon: PanelLeftIcon,
        run: () => host.ui.setSidebar(!host.ui.sidebar),
      },
      { id: 'theme.light', label: 'Light theme', group: 'Theme', run: () => setTheme('light') },
      { id: 'theme.dark', label: 'Dark theme', group: 'Theme', run: () => setTheme('dark') },
      { id: 'theme.system', label: 'System theme', group: 'Theme', run: () => setTheme('system') },
      ...(signOut
        ? [{ id: 'signout', label: 'Sign out', group: 'Actions', run: () => later(signOut()) }]
        : []),
    ];
    return [
      ...pages,
      ...panels,
      ...host.extensions.flatMap((e) => e.commands?.(host) ?? []),
      ...shell,
    ];
  }, [host, signOut]);
}

export function Shell({
  page,
  status,
  signOut,
  children,
}: {
  page: Page | null;
  status: Status;
  signOut: (() => Promise<void>) | null;
  children: ReactNode;
}) {
  const host = useHost();
  const route = useRoute();
  const commands = useCommands(signOut);
  useKeys(
    commands.flatMap((c) =>
      c.keys
        ? [{ keys: c.keys, run: () => (!c.when || c.when(host, route)) && c.run(host, route) }]
        : [],
    ),
  );
  // Pages opened that search knows (notes, topics, pages), for Recent.
  useEffect(() => {
    if (host.index.has(route.path)) opened(route.path);
  }, [route.path, host.index]);
  const panels = host.extensions.flatMap((e) =>
    e.panel && (!e.panel.when || e.panel.when(host)) ? [e.panel] : [],
  );
  const panel = panels.find((p) => p.id === host.ui.panel) ?? null;
  // Toasts stay clear of a docked panel.
  const docked = useMedia(WIDE) && !!panel;

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider open={host.ui.sidebar} onOpenChange={host.ui.setSidebar}>
        <AppSidebar status={status} signOut={signOut} />
        <SidebarInset className="min-w-0">
          <Header page={page} status={status} panels={panels} />
          <div
            className={cn(
              '@container mx-auto w-full px-4 pt-6 pb-28 md:px-6 md:pt-8 md:pb-20',
              page?.width === 'wide' ? 'max-w-6xl' : 'max-w-[44rem]',
            )}
          >
            {children}
          </div>
        </SidebarInset>
        <PanelHost panel={panel} />
        <BottomBar panels={panels} />
      </SidebarProvider>
      <Search commands={commands} />
      <Shortcuts commands={commands} />
      <Toaster
        position="bottom-right"
        offset={{ bottom: 24, right: docked ? '29.5rem' : 24 }}
        mobileOffset={{ bottom: 88 }}
      />
    </TooltipProvider>
  );
}

function Header({ page, status, panels }: { page: Page | null; status: Status; panels: Panel[] }) {
  const host = useHost();
  const failed = status.kind === 'error' || status.kind === 'offline';
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-md md:px-4">
      <SidebarTrigger className="-ml-1 max-md:hidden" />
      <a href={link('/')} className="font-bold text-foreground no-underline md:hidden">
        Vault
      </a>
      <span className="min-w-0 truncate text-muted-foreground text-sm max-md:hidden">
        {page?.title ?? ''}
      </span>
      <span
        className={cn(
          'ml-auto flex items-center gap-1.5 text-faint text-xs',
          failed && 'text-destructive',
        )}
        title={status.kind === 'error' ? status.message : syncLabel(status)}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            failed
              ? 'bg-destructive'
              : status.kind === 'syncing'
                ? 'animate-pulse bg-faint'
                : 'bg-success',
          )}
        />
        <span className="sr-only">{syncLabel(status)}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 bg-surface font-normal text-faint shadow-none max-md:hidden md:w-56 md:justify-start"
        onClick={() => host.ui.setSearch(true)}
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search…</span>
        <Keys keys="mod+k" />
      </Button>
      {panels.map((p) => (
        <Button
          key={p.id}
          variant={host.ui.panel === p.id ? 'secondary' : 'ghost'}
          size="sm"
          className="relative h-8 gap-1.5 max-md:hidden"
          aria-pressed={host.ui.panel === p.id}
          onClick={() => host.ui.togglePanel(p.id)}
        >
          <p.icon />
          {p.label}
          {!!p.indicator && <p.indicator />}
        </Button>
      ))}
    </header>
  );
}

/** The open panel: docked beside the page on a wide screen; a sheet, or on a phone a drawer, otherwise. */
function PanelHost({ panel }: { panel: Panel | null }) {
  const host = useHost();
  const wide = useMedia(WIDE);
  const phone = useMedia(PHONE);
  if (!panel) return null;
  const close = host.ui.closePanel;
  const View = panel.view;
  const body = <View arg={host.ui.arg} close={close} />;
  if (wide)
    return (
      <aside
        aria-label={panel.label}
        className="sticky top-0 flex h-svh w-[28rem] shrink-0 flex-col border-l bg-background"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <panel.icon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{panel.label}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Close"
            onClick={close}
          >
            <XIcon />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </aside>
    );
  if (phone)
    return (
      <Drawer open={true} onOpenChange={(o) => !o && close()}>
        <DrawerContent className="h-[92svh] max-h-[92svh] data-[vaul-drawer-direction=bottom]:max-h-[92svh]">
          <DrawerTitle className="sr-only">{panel.label}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <Sheet open={true} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="flex w-[28rem] flex-col gap-0 p-0 sm:max-w-[28rem]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 pr-12">
          <panel.icon className="size-4 text-muted-foreground" />
          <SheetTitle className="font-medium text-sm">{panel.label}</SheetTitle>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

/** A phone's bottom bar: Home, the tab pages, the panel (raised, in the middle), search and the menu. */
function BottomBar({ panels }: { panels: Panel[] }) {
  const host = useHost();
  const { path } = useRoute();
  const { setOpenMobile } = useSidebar();
  const tabs = navOf(host).filter((n) => n.tab);
  const [main] = panels;
  const item =
    'flex h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] text-muted-foreground no-underline [&_svg]:size-5';
  const on = 'text-primary';
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <a href={link('/')} className={cn(item, path === '/' && on)}>
        <HouseIcon />
        Home
      </a>
      {tabs.map((n) => (
        <a key={n.href} href={link(n.href)} className={cn(item, path.startsWith(n.href) && on)}>
          {!!n.icon && <n.icon />}
          {n.label}
        </a>
      ))}
      {!!main && (
        <button
          type="button"
          className={cn(item, 'relative')}
          onClick={() => host.ui.togglePanel(main.id)}
        >
          <span className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop [&_svg]:size-6">
            <main.icon />
          </span>
          {main.label}
          {!!main.indicator && (
            <span className="absolute top-[-1.25rem] right-[calc(50%-1.9rem)]">
              <main.indicator />
            </span>
          )}
        </button>
      )}
      <button type="button" className={item} onClick={() => host.ui.setSearch(true)}>
        <SearchIcon />
        Search
      </button>
      <button type="button" className={item} onClick={() => setOpenMobile(true)}>
        <MenuIcon />
        Menu
      </button>
    </nav>
  );
}

/** ?: every command with keys, by group, and how lists move. */
function Shortcuts({ commands }: { commands: Command[] }) {
  const host = useHost();
  const route = useRoute();
  const keyed = commands.filter((c) => c.keys && (!c.when || c.when(host, route)));
  const rows: { group: string; label: string; keys: string }[] = [
    ...keyed.map((c) => ({ group: c.group, label: c.label, keys: c.keys! })),
    { group: 'Actions', label: 'Show or hide the sidebar', keys: 'mod+b' },
    { group: 'Lists', label: 'Next / previous', keys: 'j' },
    { group: 'Lists', label: 'Previous', keys: 'k' },
    { group: 'Lists', label: 'Move, once in a list', keys: '↑ ↓' },
    { group: 'Lists', label: 'Open', keys: 'Enter' },
    { group: 'Lists', label: 'Leave the list', keys: 'Esc' },
  ];
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <Dialog open={host.ui.help} onOpenChange={host.ui.setHelp}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Plain keys work when you aren't typing.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-1.5 font-semibold text-faint text-xs uppercase tracking-wider">
                {g}
              </h3>
              <ul className="m-0 grid list-none gap-1 p-0">
                {rows
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <li
                      key={`${r.label}${r.keys}`}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      {r.label}
                      <Keys keys={r.keys} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
