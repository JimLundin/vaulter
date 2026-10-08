// Hover previews on links to notes (mouse only), and tooltips on chart marks.
import { useEffect, useRef, useState } from 'react';
import { parseRoute } from './route.ts';
import type { Entry } from './search.ts';

// Links to notes in prose, and in any list marked data-previews (backlinks, note lists).
const LINKS = 'a.vault-link, [data-previews] a, .dash a';

export function Previews({ index }: { index: Map<string, Entry> }) {
  const [pv, setPv] = useState<{ n: Entry; r: DOMRect } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const pvEl = useRef<HTMLDivElement | null>(null);
  const tipEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const over = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>(LINKS);
      if (!(a && hover)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const n = index.get(parseRoute(a.getAttribute('href') ?? '').path);
        if (n) setPv({ n, r: a.getBoundingClientRect() });
      }, 250);
    };
    const out = (e: MouseEvent) => {
      if ((e.target as Element).closest('a')) {
        clearTimeout(timer);
        setPv(null);
      }
    };
    const move = (e: PointerEvent) => {
      const t = (e.target as Element).closest('.chart [data-tip]');
      setTip(t ? { text: t.getAttribute('data-tip') ?? '', x: e.pageX, y: e.pageY } : null);
    };
    const leave = () => {
      clearTimeout(timer);
      setPv(null);
    };
    addEventListener('mouseover', over);
    addEventListener('mouseout', out);
    addEventListener('pointermove', move);
    addEventListener('hashchange', leave);
    return () => {
      clearTimeout(timer);
      removeEventListener('mouseover', over);
      removeEventListener('mouseout', out);
      removeEventListener('pointermove', move);
      removeEventListener('hashchange', leave);
    };
  }, [index]);

  // Place each once it has a size: the preview under its link (above when there's no room), the tooltip above the pointer.
  useEffect(() => {
    const el = pvEl.current;
    if (!(el && pv)) return;
    const { r } = pv;
    el.style.left = `${Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - el.offsetWidth - 12))}px`;
    el.style.top = `${
      r.bottom + el.offsetHeight + 16 > innerHeight
        ? r.top + scrollY - el.offsetHeight - 8
        : r.bottom + scrollY + 8
    }px`;
  }, [pv]);
  useEffect(() => {
    const el = tipEl.current;
    if (!(el && tip)) return;
    el.style.left = `${Math.min(tip.x + 12, scrollX + innerWidth - el.offsetWidth - 8)}px`;
    el.style.top = `${tip.y - el.offsetHeight - 10}px`;
  }, [tip]);

  return (
    <>
      {!!pv && (
        // biome-ignore lint/correctness/useUniqueElementIds: the shell's one preview
        <div
          id="preview"
          role="tooltip"
          ref={pvEl}
          className="pointer-events-none absolute z-20 max-w-sm rounded-lg border bg-popover p-3 text-sm leading-normal text-popover-foreground shadow-pop"
        >
          <div className="mb-1 font-semibold">{pv.n.t}</div>
          {!!pv.n.e && <p className="m-0 text-muted-foreground">{pv.n.e}</p>}
        </div>
      )}
      {!!tip && (
        // biome-ignore lint/correctness/useUniqueElementIds: the shell's one chart tooltip
        <div
          id="charttip"
          role="tooltip"
          ref={tipEl}
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground tabular-nums shadow-pop"
        >
          {tip.text}
        </div>
      )}
    </>
  );
}
