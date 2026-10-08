// A note's neighbourhood: the note in the middle, every note it links to, is linked from or relates to
// fanned out in two columns, grouped and coloured by area (same colours and edges as the Map). Static
// SVG; every neighbour is a link. On a phone, a branching list instead.
import type { Note } from '../notes/model/fields.ts';
import { useHeavy, useSchema } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { cn } from 'cn';
import { Section } from '@/components/layout.tsx';
import './localmap.css';
import { mapPage } from './routes.ts';

const MAX = 24;
const ROW = 26;
const rad = (deg: number) => Math.min(3.5 + Math.sqrt(deg) * 1.1, 8);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const f = (v: number) => Math.round(v * 10) / 10;

export function LocalMap({ note }: { note: Note }) {
  const map = useHeavy('map');
  const { areas, areaOf } = useSchema();
  const areaOrder = (a: string) => {
    const k = areas.findIndex((x) => x.key === a);
    return k < 0 ? areas.length : k;
  };
  const me = map?.nodes.find((n) => n.id === note.id);
  if (!(map && me)) return null;
  const { nodes, edges } = map;
  const all = edges
    .filter((e) => e.a === me.i || e.b === me.i)
    .map((e) => ({ n: nodes[e.a === me.i ? e.b : e.a], e }));
  if (!all.length) return null;
  // Keep the strongest neighbours when there are many: typed relations first, then the most connected.
  const shown = [...all]
    .sort((x, y) => Number(!!y.e.rel.length) - Number(!!x.e.rel.length) || y.n.degree - x.n.degree)
    .slice(0, MAX)
    .sort(
      (x, y) =>
        areaOrder(x.n.area) - areaOrder(y.n.area) ||
        y.n.degree - x.n.degree ||
        x.n.title.localeCompare(y.n.title),
    );
  type Item = (typeof shown)[number] & {
    x: number;
    y: number;
    r: number;
    tx: number;
    anchor: 'start' | 'end';
  };

  // Wide (fan): the note in the middle, neighbours in two columns either side.
  const wide = (() => {
    const W = 540;
    const TOP = 34;
    const COLX = [200, 340];
    const half = shown.length > 1 ? Math.ceil(shown.length / 2) : 0;
    const cols = [shown.slice(0, half), shown.slice(half)];
    const rows = Math.max(cols[0].length, cols[1].length, 1);
    const cx = W / 2;
    const cy = TOP + (rows * ROW) / 2 - 4;
    const items: Item[] = cols.flatMap((col, side) =>
      col.map((x, r) => ({
        ...x,
        x: COLX[side],
        y: TOP + ((rows - col.length) * ROW) / 2 + r * ROW + ROW / 2,
        r: rad(x.n.degree),
        tx: side ? COLX[side] + 12 : COLX[side] - 12,
        anchor: side ? ('start' as const) : ('end' as const),
      })),
    );
    return {
      cls: 'wide',
      W,
      H: TOP + rows * ROW + 6,
      cx,
      cy,
      me: { x: cx, y: cy - 18, anchor: 'middle' as const, base: 'auto' as const },
      items,
      len: 25,
    };
  })();
  // Narrow (phone): the note top left, neighbours one per row below it.
  const narrow = (() => {
    const W = 320;
    const cx = 14;
    const cy = 16;
    const X = 74;
    const items: Item[] = shown.map((x, r) => ({
      ...x,
      x: X,
      y: cy + 22 + r * ROW + ROW / 2,
      r: rad(x.n.degree),
      tx: X + 12,
      anchor: 'start' as const,
    }));
    return {
      cls: 'narrow',
      W,
      H: cy + 22 + shown.length * ROW + 4,
      cx,
      cy,
      me: { x: cx + 16, y: cy, anchor: 'start' as const, base: 'central' as const },
      items,
      len: 28,
    };
  })();
  // Lines end at the rims, so the dots' surface rings stay clean.
  const seg = (cx: number, cy: number, it: Item) => {
    const dx = it.x - cx;
    const dy = it.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x1: f(cx + (dx / d) * 10),
      y1: f(cy + (dy / d) * 10),
      x2: f(it.x - (dx / d) * it.r),
      y2: f(it.y - (dy / d) * it.r),
    };
  };
  const more = all.length - shown.length;

  return (
    <Section
      className="v-lmap"
      title="Neighbourhood"
      count={all.length}
      action={
        <a className="text-primary hover:underline" href={link(mapPage.href())}>
          full map →
        </a>
      }
    >
      {[wide, narrow].map((L) => (
        <svg
          key={L.cls}
          className={cn(
            'block h-auto w-full overflow-visible',
            L.cls === 'wide'
              ? 'mx-auto max-w-[34rem] max-[560px]:hidden'
              : 'hidden max-w-[24rem] max-[560px]:block',
          )}
          viewBox={`0 0 ${L.W} ${L.H}`}
          style={{ aspectRatio: `${L.W} / ${L.H}` }}
          role="img"
          aria-label={`${me.title} and the ${all.length} notes it connects to, by area`}
        >
          <g className="lm-edges">
            {L.cls === 'narrow' && L.items.length > 0 && (
              <line
                className="trunk"
                x1={L.cx}
                y1={L.cy + 10}
                x2={L.cx}
                y2={f(L.items.at(-1)!.y)}
              />
            )}
            {L.items.map((it) => (
              <line
                key={it.n.i}
                className={it.e.rel.length ? 'rel' : 'lnk'}
                {...(L.cls === 'narrow'
                  ? { x1: L.cx, y1: f(it.y), x2: f(it.x - it.r - 2), y2: f(it.y) }
                  : seg(L.cx, L.cy, it))}
              >
                <title>
                  {it.e.rel.length ? it.e.rel.join('\n') : `${me.title} ↔ ${it.n.title}`}
                </title>
              </line>
            ))}
          </g>
          {L.items.map((it) => (
            <a key={it.n.i} href={link(it.n.href)} className={`lm-n a-${it.n.area || 'none'}`}>
              <title>{`${it.n.title}${it.n.area ? ` · ${areaOf.get(it.n.area)?.label}` : ''}${it.n.summary ? `\n${it.n.summary}` : ''}`}</title>
              <circle cx={it.x} cy={f(it.y)} r={f(it.r)} />
              <text x={it.tx} y={f(it.y)} textAnchor={it.anchor}>
                {clip(it.n.title, L.len)}
              </text>
            </a>
          ))}
          <g className={`lm-me a-${me.area || 'none'}`}>
            <circle cx={L.cx} cy={f(L.cy)} r="10" />
            <text x={L.me.x} y={f(L.me.y)} textAnchor={L.me.anchor} dominantBaseline={L.me.base}>
              {clip(me.title, 30)}
            </text>
          </g>
        </svg>
      ))}
      <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground">
        {areas
          .filter(({ key: k }) => shown.some((x) => x.n.area === k))
          .map(({ key: k, label }) => (
            <li key={k} className={`a-${k} flex items-center gap-1.5`}>
              <i className="size-2 rounded-full bg-(--c)" />
              {label}
              <span className="text-faint tabular-nums">
                {shown.filter((x) => x.n.area === k).length}
              </span>
            </li>
          ))}
        <li className="flex items-center gap-1.5">
          <i className="w-5 border-t-[1.5px] border-faint" />
          relation
          <i className="ml-2 w-5 border-t border-dashed border-faint" />
          link
        </li>
      </ul>
      {more > 0 && (
        <p className="m-0 mt-2 text-center text-xs text-faint">
          Showing the {shown.length} strongest connections; {more} more are on the{' '}
          <a className="text-primary no-underline hover:underline" href={link(mapPage.href())}>
            map
          </a>{' '}
          and listed below.
        </p>
      )}
    </Section>
  );
}
