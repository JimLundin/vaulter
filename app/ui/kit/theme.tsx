// Light, dark, or as the system is. The stylesheet follows the system by itself (light-dark() and
// color-scheme); choosing one sets .light or .dark on <html>, as do system changes while following it,
// so shadcn's dark: variants apply too. The choice is this device's, kept in localStorage.
import { useSyncExternalStore } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { RadioGroup } from 'radix-ui';
import { useIsMobile } from './hooks/use-mobile.ts';
import { cn } from './lib/utils.ts';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'vaulter.theme';
const DARK = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

const stored = (): Theme => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

let current: Theme = 'system';

function apply() {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const dark =
    current === 'dark' || (current === 'system' && !!globalThis.matchMedia?.(DARK).matches);
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
}

/** At start, before anything draws: the device's choice, and the system's from then on. */
export function startTheme() {
  current = stored();
  apply();
  globalThis.matchMedia?.(DARK).addEventListener('change', () => {
    if (current === 'system') apply();
  });
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    if (theme === 'system') globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, theme);
  } catch {
    // Not kept (private browsing): it still applies until the page closes.
  }
  apply();
  for (const l of listeners) l();
}

const isDark = () => !!globalThis.document?.documentElement.classList.contains('dark');

/** Whether the page is dark now, whatever the choice: for what draws its own colours (a map). */
export const useDark = (): boolean =>
  useSyncExternalStore((l) => {
    const root = globalThis.document?.documentElement;
    if (!root) return () => undefined;
    const watch = new MutationObserver(l);
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, isDark);

export const useTheme = (): Theme =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );

const CHOICES: [Theme, IconName, string][] = [
  ['system', 'system', 'As the system'],
  ['light', 'light', 'Light'],
  ['dark', 'dark', 'Dark'],
];

/** Full-width touch choices on phones, compact choices in the desktop form column. */
export function ThemeSwitch() {
  const theme = useTheme();
  const mobile = useIsMobile();
  return (
    <RadioGroup.Root
      value={theme}
      onValueChange={(value) => setTheme(value as Theme)}
      aria-label="Appearance"
      className={
        mobile ? 'flex flex-col divide-y border-y' : 'flex flex-wrap gap-1 rounded-lg border p-1'
      }
    >
      {CHOICES.map(([value, icon, label]) => (
        <RadioGroup.Item
          key={value}
          value={value}
          aria-label={label}
          className={cn(
            'flex items-center gap-2 text-[13px] focus-visible:outline-2 focus-visible:outline-ring hover:bg-muted',
            mobile
              ? 'min-h-12 w-full px-2 text-left'
              : 'min-h-9 flex-1 justify-center rounded-md px-2',
            !mobile && theme === value && 'bg-muted font-medium',
          )}
        >
          <Icon name={icon} size={mobile ? 'md' : 'sm'} />
          <span className={mobile ? 'flex-1' : ''}>{label.replace('As the system', 'System')}</span>
          {mobile && (
            <RadioGroup.Indicator>
              <Icon name="check" />
            </RadioGroup.Indicator>
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
