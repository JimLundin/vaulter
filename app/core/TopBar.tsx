// The top bar: home, the extensions' links (a menu on narrow screens), the sync state, the theme, and
// search (Search.tsx).
import { MenuIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { cn } from 'cn';
import type { Entry } from '../../core/search.ts';
import { useHost, navOf } from './host.tsx';
import { link, useRoute } from './route.ts';
import type { Status } from './session.ts';
import { type Theme, useTheme } from './theme.ts';
import { Search } from './Search.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';

const time = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const label = (s: Status) =>
  s.kind === 'syncing'
    ? 'syncing…'
    : s.kind === 'synced'
      ? `synced ${time(s.at)}`
      : s.kind === 'offline'
        ? 'offline'
        : s.kind === 'error'
          ? 'sync failed'
          : '';

const THEMES: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

export function TopBar({
  status,
  signOut,
  index,
}: {
  status: Status;
  signOut: (() => Promise<void>) | null;
  index: Map<string, Entry>;
}) {
  const host = useHost();
  const { path } = useRoute();
  const [theme, setTheme] = useTheme();
  const nav = navOf(host)
    .map((n) => ({ ...n, count: n.badge?.(host) }))
    .filter((n) => n.count !== 0);
  const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? MonitorIcon;
  const failed = status.kind === 'error' || status.kind === 'offline';

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 max-sm:h-auto max-sm:flex-wrap max-sm:py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild={true}>
            <Button variant="ghost" size="icon" className="-ml-2 md:hidden" aria-label="Pages">
              <MenuIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {nav.map((n) => (
              <DropdownMenuItem key={n.href} asChild={true}>
                <a href={link(n.href)}>
                  {n.label}
                  {!!n.count && <Badge className="ml-auto">{n.count}</Badge>}
                </a>
              </DropdownMenuItem>
            ))}
            {!!signOut && <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <a href={link('/')} className="mr-3 font-bold text-foreground no-underline">
          Vault
        </a>
        <nav className="flex items-center gap-0.5 max-md:hidden">
          {nav.map((n) => (
            <Button
              key={n.href}
              asChild={true}
              variant="ghost"
              size="sm"
              className={cn(
                'font-normal text-muted-foreground no-underline',
                path.startsWith(n.href) && 'bg-accent text-accent-foreground',
              )}
            >
              <a href={link(n.href)}>
                {n.label}
                {!!n.count && (
                  <Badge className="h-4.5 min-w-4.5 px-1 tabular-nums">{n.count}</Badge>
                )}
              </a>
            </Button>
          ))}
        </nav>
        <span
          className={cn(
            'ml-2 whitespace-nowrap text-xs text-faint max-sm:ml-auto',
            failed && 'text-destructive',
          )}
          title={status.kind === 'error' ? status.message : undefined}
        >
          {label(status)}
        </span>
        <div className="ml-auto flex items-center gap-1 max-sm:order-last max-sm:ml-0 max-sm:mt-2 max-sm:w-full">
          <div className="flex-1">
            <Search index={index} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild={true}>
              <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}`}>
                <ThemeIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                {THEMES.map((t) => (
                  <DropdownMenuRadioItem key={t.value} value={t.value}>
                    {t.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {!!signOut && (
            <Button
              variant="ghost"
              size="sm"
              className="font-normal max-md:hidden"
              onClick={signOut}
            >
              Sign out
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
