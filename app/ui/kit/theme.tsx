// Light, dark, or as the system is. The stylesheet follows the system by itself (light-dark() and
// color-scheme); choosing one sets .light or .dark on <html>, as do system changes while following it,
// so shadcn's dark: variants apply too. The choice is this device's, kept in localStorage.
import { useSyncExternalStore } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { Text } from './parts/layout.tsx';
import { RadioGroup, RadioGroupItem, RadioGroupIndicator } from './parts/radio-group.tsx';
import { useLayout } from './hooks/use-layout.ts';

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
  const mobile = useLayout() === 'compact';
  return (
    <RadioGroup
      variant="choices"
      value={theme}
      onValueChange={(value) => setTheme(value as Theme)}
      aria-label="Appearance"
    >
      {CHOICES.map(([value, icon, label]) => (
        <RadioGroupItem key={value} value={value} aria-label={label}>
          <Icon name={icon} size={mobile ? 'md' : 'sm'} />
          <Text as="span" size="sm">
            {label.replace('As the system', 'System')}
          </Text>
          <RadioGroupIndicator>
            <Icon name="check" />
          </RadioGroupIndicator>
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
