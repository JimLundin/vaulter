// A note's rail, beside the body when the page is wide enough: "On this page" (the body's h2/h3, with the
// one being read highlighted), the note's properties, and jumps to the sections under the body. Below
// that width, OnThisPage is a collapsible at the top of a long note.
import { useEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ChevronDownIcon, ListIcon } from 'lucide-react';
import { link } from '../../core/route.ts';
import { cn } from 'cn';
import { Eyebrow } from '@/components/layout.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';

export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3;
}

const same = <T,>(a: T[], b: T[]) =>
  a.length === b.length &&
  a.every((x, i) =>
    Object.entries(x as object).every(([k, v]) => (b[i] as Record<string, unknown>)[k] === v),
  );

/** What's under a container as it renders (the vault refreshes), re-read on change. */
function useDom<T>(
  ref: RefObject<HTMLElement | null>,
  read: (el: HTMLElement) => T[],
  key: unknown,
) {
  const [items, setItems] = useState<T[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key (the note) is the trigger; read is stable per caller
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setItems((old) => {
        const next = read(el);
        return same(next, old) ? old : next;
      });
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ref, key]);
  return items;
}

const readHeadings = (el: HTMLElement): Heading[] =>
  [...el.querySelectorAll<HTMLElement>(':scope > h2[id], :scope > h3[id]')].map((h) => ({
    id: h.id,
    text: h.textContent?.trim() ?? '',
    depth: h.tagName === 'H2' ? 2 : 3,
  }));

/** The article's h2/h3 (ids from rehypeHeadingIds). */
export const useHeadings = (ref: RefObject<HTMLElement | null>, key: unknown) =>
  useDom(ref, readHeadings, key);

export interface Jump {
  title: string;
  count: string;
  el: HTMLElement;
}

// A Section (layout.tsx) is a <section> whose first child holds its <h2>: the title, then the count in a span.
const readJumps = (el: HTMLElement): Jump[] =>
  [...el.querySelectorAll<HTMLElement>('section')].flatMap((s) => {
    const h = s.querySelector(':scope > div > h2');
    if (!h) return [];
    const count = h.querySelector(':scope > span');
    const title = [...h.childNodes].filter((n) => n !== count).map((n) => n.textContent);
    return [{ title: title.join('').trim(), count: count?.textContent ?? '', el: s }];
  });

/** The sections under the body (each extension's; whichever render). */
export const useJumps = (ref: RefObject<HTMLElement | null>, key: unknown) =>
  useDom(ref, readJumps, key);

/** The heading being read: the last one that has passed under the header. Headings crossing the top of
 * the page tell the observer; a jump past several (a long section, a hash) is caught on the scroll. */
function useActive(headings: Heading[]) {
  const [active, setActive] = useState('');
  useEffect(() => {
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // Under the 48px header, past the headings' scroll margin (prose.css).
    const top = 80;
    let frame = 0;
    const pick = () => {
      frame = 0;
      // At the end of the page the last headings can't reach the top: the last one on screen is it.
      const end = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      let at = els[0].id;
      for (const e of els)
        if (e.getBoundingClientRect().top <= (end ? innerHeight * 0.6 : top + 1)) at = e.id;
      setActive(at);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };
    const io = new IntersectionObserver(later, { rootMargin: `-${top}px 0px 0px 0px` });
    for (const e of els) io.observe(e);
    addEventListener('scroll', later, { passive: true });
    pick();
    return () => {
      io.disconnect();
      removeEventListener('scroll', later);
      cancelAnimationFrame(frame);
    };
  }, [headings]);
  return active;
}

const FOLD = 12;

const row =
  'block rounded-sm py-[3px] text-muted-foreground no-underline outline-none hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/** The headings as links, the one being read marked. A long list (`fold`) shows the h3s of the h2 being
 * read only. */
export function Toc({
  headings,
  href,
  fold = false,
}: {
  headings: Heading[];
  href: string;
  fold?: boolean;
}) {
  const active = useActive(headings);
  // Each heading's h2: itself, or the last h2 before it.
  const parent = new Map<string, string>();
  let h2 = '';
  for (const h of headings) {
    if (h.depth === 2) h2 = h.id;
    parent.set(h.id, h2);
  }
  const shown =
    fold && headings.length > FOLD
      ? headings.filter((h) => h.depth === 2 || parent.get(h.id) === parent.get(active))
      : headings;
  return (
    <ul className="m-0 list-none border-l p-0 text-sm">
      {shown.map((h) => (
        <li key={h.id} className="m-0">
          <a
            data-nav={true}
            href={link(`${href}#${h.id}`)}
            aria-current={h.id === active ? 'location' : undefined}
            className={cn(
              row,
              '-ml-px border-l-2 border-transparent pr-2 leading-snug',
              h.depth === 3 ? 'pl-6' : 'pl-3',
              h.id === active && 'border-primary font-medium text-foreground',
            )}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The sections under the body, as jumps. */
export function Jumps({ jumps }: { jumps: Jump[] }) {
  return (
    <ul className="m-0 list-none p-0 text-sm">
      {jumps.map((j) => (
        <li key={j.title} className="m-0">
          <button
            type="button"
            data-nav={true}
            onClick={() => j.el.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={cn(
              row,
              '-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-baseline gap-2 px-2 text-left',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{j.title}</span>
            {!!j.count && <span className="text-xs text-faint tabular-nums">{j.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Eyebrow className="block">{title}</Eyebrow>
      {children}
    </div>
  );
}

/** On this page, folded, at the top of a long note where there's no rail. */
export function OnThisPage({ headings, href }: { headings: Heading[]; href: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-6 rounded-lg border bg-surface/50"
    >
      <CollapsibleTrigger className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ListIcon className="size-4" />
        On this page
        <span className="text-xs font-normal text-faint tabular-nums">{headings.length}</span>
        <ChevronDownIcon
          className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2 [&_a]:py-2">
        <Toc headings={headings} href={href} />
      </CollapsibleContent>
    </Collapsible>
  );
}
