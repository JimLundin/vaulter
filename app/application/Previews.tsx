// Resolve retained vault-link content; hover and popup mechanics belong to the kit.
import { useCallback } from 'react';
import { HoverPreview } from '@/ui/kit/index.ts';
import { parseRoute } from '@/navigation/routing.ts';
import type { Entry } from '@/search/entries.ts';

export function Previews({ index }: { index: Map<string, Entry> }) {
  const resolve = useCallback(
    (href: string) => {
      const entry = index.get(parseRoute(href).path);
      return entry ? { title: entry.t, text: entry.e } : undefined;
    },
    [index],
  );
  return <HoverPreview resolve={resolve} selector="a.vault-link, [data-previews] a" />;
}
