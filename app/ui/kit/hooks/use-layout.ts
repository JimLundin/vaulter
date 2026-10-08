import { useSyncExternalStore } from 'react';
import { usePresentation } from '../presentation.tsx';

export type SizeClass = 'compact' | 'expanded' | 'wide';

// CSS owns the thresholds, including Tailwind's md/xl variants. Read those same tokens for changes
// that need React structure; callers never need to know a pixel breakpoint.
function queries() {
  const style = getComputedStyle(document.documentElement);
  const query = (name: string) => {
    const value = style.getPropertyValue(name).trim();
    return value ? window.matchMedia(`(min-width: ${value})`) : null;
  };
  return [query('--breakpoint-md'), query('--breakpoint-xl')];
}

function snapshot(): SizeClass {
  const [expanded, wide] = queries();
  if (wide?.matches) return 'wide';
  return expanded && !expanded.matches ? 'compact' : 'expanded';
}

function subscribe(changed: () => void) {
  const media = queries();
  for (const query of media) query?.addEventListener('change', changed);
  return () => {
    for (const query of media) query?.removeEventListener('change', changed);
  };
}

export function useLayout(): SizeClass {
  const presentation = usePresentation();
  const windowLayout = useSyncExternalStore<SizeClass>(
    presentation ? () => () => {} : subscribe,
    presentation ? () => presentation.layout : snapshot,
    () => 'expanded',
  );
  return windowLayout;
}
