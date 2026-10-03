// Light, dark, or the OS's (the default): data-theme on <html>, which theme.css's color-scheme follows.
// Kept per device; views that paint outside CSS (Leaflet's markers) listen for the change.
import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'vault-theme';
const EVENT = 'vault-theme';
const DARK = '(prefers-color-scheme: dark)';

const stored = (): Theme => {
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
};

/** Applies the device's choice; main.tsx calls it before the first render. */
export function applyTheme(t: Theme = stored()) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme) {
  if (t === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, t);
  applyTheme(t);
  dispatchEvent(new Event(EVENT));
}

/** Whether the page is dark now, whichever way that was chosen. */
export const isDark = () => {
  const t = stored();
  return t === 'system' ? matchMedia(DARK).matches : t === 'dark';
};

/** Calls `f` when the page switches between light and dark (a choice here, or the OS). */
export function onThemeChange(f: () => void) {
  const mq = matchMedia(DARK);
  mq.addEventListener('change', f);
  addEventListener(EVENT, f);
  return () => {
    mq.removeEventListener('change', f);
    removeEventListener(EVENT, f);
  };
}

export function useTheme() {
  const [theme, set] = useState(stored);
  useEffect(() => onThemeChange(() => set(stored())), []);
  return [theme, setTheme] as const;
}
