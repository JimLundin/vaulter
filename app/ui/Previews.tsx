// Delegated mouse previews for vault links produced by content renderers.
import { useEffect, useState } from 'react';
import { HoverPreview } from './kit/index.ts';
import { parseRoute } from './routing.ts';
import type { Entry } from '../vault/documents/search.ts';

export function Previews({ index }: { index: Map<string, Entry> }) {
  const [preview, setPreview] = useState<{ entry: Entry; anchor: DOMRect } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const over = (event: MouseEvent) => {
      const a = (event.target as Element).closest<HTMLAnchorElement>(
        'a.vault-link, [data-previews] a',
      );
      if (!(a && hover)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const entry = index.get(parseRoute(a.getAttribute('href') ?? '').path);
        if (entry) setPreview({ entry, anchor: a.getBoundingClientRect() });
      }, 250);
    };
    const leave = () => {
      clearTimeout(timer);
      setPreview(null);
    };
    const out = (event: MouseEvent) => {
      if ((event.target as Element).closest('a')) leave();
    };
    addEventListener('mouseover', over);
    addEventListener('mouseout', out);
    addEventListener('hashchange', leave);
    addEventListener('scroll', leave, true);
    return () => {
      leave();
      removeEventListener('mouseover', over);
      removeEventListener('mouseout', out);
      removeEventListener('hashchange', leave);
      removeEventListener('scroll', leave, true);
    };
  }, [index]);
  return preview ? (
    <HoverPreview title={preview.entry.t} text={preview.entry.e} anchor={preview.anchor} />
  ) : null;
}
