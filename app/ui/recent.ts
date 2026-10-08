// The pages opened lately on this device, newest first: ⌘K's Recent, and the notes' in the sidebar. The
// shell records each route search knows; what's kept is its href, so a renamed note just drops out.
import { useSyncExternalStore } from 'react';

const KEY = 'vault-recent';
const MAX = 20;
const listeners = new Set<() => void>();
let hrefs: string[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((h) => typeof h === 'string') : [];
  } catch {
    return [];
  }
})();

export function opened(href: string) {
  if (hrefs[0] === href) return;
  hrefs = [href, ...hrefs.filter((h) => h !== href)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(hrefs));
  for (const f of listeners) f();
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export const useRecent = () => useSyncExternalStore(subscribe, () => hrefs);
