// The vault as a map: every topical note a dot coloured by area and sized by connections, links and
// relations as edges (layout: core/vault-map.ts). graph-view.ts adds filters, pan/zoom and focus.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { useEffect, useRef } from 'react';
import { MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import type { VaultMap } from '../../../core/vault-map.ts';
import { topicHref } from '../../../core/note-fields.ts';
import { initMap } from './graph-view.ts';
import { useHeavy, useSchema } from '../../shell/host.tsx';
import { link } from '../../shell/route.ts';
import { Loading, PageHeader } from '@/components/layout.tsx';
import { Button } from '@/components/ui/button.tsx';
import './map.css';

const f = (v: number) => Math.round(v * 10) / 10;

export function MapView() {
  const map = useHeavy('map');
  if (!map)
    return (
      <div className="v-map">
        <PageHeader kind="map" title="Map" />
        <Loading>Laying out the map…</Loading>
      </div>
    );
  return <MapSvg map={map} />;
}

function MapSvg({ map }: { map: VaultMap }) {
  const { nodes, edges, width, height, regions } = map;
  const { areas, areaOf } = useSchema();
  const box = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      initMap(
        box.current!,
        nodes.map((n) => ({
          t: n.title,
          h: link(n.href),
          s: n.summary,
          a: n.area,
          y: n.type,
          d: n.degree,
        })),
        areaOf,
      ),
    [nodes, areaOf],
  );

  const counts = Object.fromEntries(
    areas.map(({ key }) => [key, nodes.filter((n) => n.area === key).length]),
  );
  const relCount = edges.filter((e) => e.rel.length).length;
  // Edges drawn short of the dots' rims so the 2px ring around each dot stays clean.
  const seg = (e: (typeof edges)[number]) => {
    const a = nodes[e.a];
    const b = nodes[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x1: f(a.x + (dx / d) * a.r),
      y1: f(a.y + (dy / d) * a.r),
      x2: f(b.x - (dx / d) * b.r),
      y2: f(b.y - (dy / d) * b.r),
    };
  };
  // Where a label sits relative to its dot (chosen by the layout); offsets in em stay screen-sized.
  const place = (n: (typeof nodes)[number]) =>
    ({
      b: { x: n.x, y: f(n.y + n.r), dy: '.35em' },
      t: { x: n.x, y: f(n.y - n.r), dy: '-.35em' },
      r: { x: f(n.x + n.r), y: n.y, dx: '.35em' },
      l: { x: f(n.x - n.r), y: n.y, dx: '-.35em' },
    })[n.labelPos];
  const tip = (n: (typeof nodes)[number]) =>
    `${n.title}${n.area ? ` · ${areaOf.get(n.area)?.label}` : ''}${n.type ? ` · ${n.type}` : ''}\n${n.summary}`;

  return (
    <div className="v-map">
      <PageHeader
        kind="map"
        title="Map"
        lede={
          <p>
            {nodes.length} notes and {edges.length} connections, {relCount} of them typed relations.
            Coloured by area; bigger dots are more connected. Tap a dot to see its neighbourhood.
          </p>
        }
      />
      {/* Wider than the reading column, centred on it. */}
      <div className="relative mt-4 mb-3 w-full" ref={box}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* aria-pressed on the chips and "Relations only" belongs to graph-view.ts; React sets it once. */}
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0" aria-label="Areas">
            {areas.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`vm-chip a-${key} group inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-background px-3 text-sm text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[pressed=false]:border-dashed aria-[pressed=false]:text-faint`}
                data-area={key}
                aria-pressed="true"
              >
                <i className="size-2.5 rounded-full bg-(--c) group-aria-[pressed=false]:bg-transparent group-aria-[pressed=false]:shadow-[inset_0_0_0_1.5px_var(--c)]" />
                {label}
                <span className="text-xs text-faint tabular-nums">{counts[key]}</span>
              </button>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              data-edges={true}
              aria-pressed="false"
              title="Show only typed relations"
            >
              Relations only
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              data-zoom="1"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <PlusIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              data-zoom="-1"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <MinusIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              data-zoom="0"
              aria-label="Reset view"
              title="Reset view"
            >
              <RotateCcwIcon />
            </Button>
          </div>
        </div>
        <svg
          className="vm-svg block h-auto max-h-[min(74vh,48rem)] w-full cursor-grab touch-none select-none rounded-xl border bg-surface [&.drag]:cursor-grabbing"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Map of ${nodes.length} notes coloured by area`}
          data-w={width}
          data-h={height}
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <g className="vm-vp">
            <g className="vm-edges">
              {edges.map((e) => (
                <line
                  key={`${e.a}-${e.b}`}
                  className={e.rel.length ? 'rel' : 'lnk'}
                  data-a={e.a}
                  data-b={e.b}
                  {...seg(e)}
                >
                  <title>
                    {e.rel.length ? e.rel.join('\n') : `${nodes[e.a].title} ↔ ${nodes[e.b].title}`}
                  </title>
                </line>
              ))}
            </g>
            <g className="vm-nodes">
              {nodes.map((n) => (
                <a
                  key={n.i}
                  href={link(n.href)}
                  className={`vm-n a-${n.area || 'none'}${n.status === 'active' ? ' act' : ''}`}
                  data-i={n.i}
                  data-area={n.area}
                  data-l={n.labelAt}
                >
                  <title>{tip(n)}</title>
                  <circle cx={n.x} cy={n.y} r={f(n.r)} />
                </a>
              ))}
            </g>
            {/* Labels sit above every dot; each mirrors its dot's state classes (graph-view.ts). */}
            {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: labels repeat each dot's title; nothing here takes focus */}
            <g className="vm-labels" aria-hidden="true">
              {regions.map((r) => (
                <text key={r.key} className={`vm-region a-${r.key}`} x={r.x} y={r.y}>
                  {r.label}
                </text>
              ))}
              {nodes.map((n) => (
                <text
                  key={n.i}
                  className={`vm-l p-${n.labelPos} t${n.tier}${n.labelAt <= 1 ? ' lab' : ''}`}
                  data-i={n.i}
                  {...place(n)}
                >
                  {n.title}
                </text>
              ))}
            </g>
          </g>
        </svg>
        {/* Filled by graph-view.ts when a dot is picked: over the map's corner, below it on a phone. */}
        <div
          className="vm-card absolute bottom-3 left-3 z-10 w-[min(26rem,calc(100%-1.5rem))] rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-pop max-sm:static max-sm:mt-3 max-sm:w-full"
          hidden={true}
          aria-live="polite"
        />
      </div>
      <p className="m-0 text-sm text-faint">
        Solid lines are typed relations (<code>relations</code> in a note's frontmatter); faint
        lines are links in the text. Rings mark notes that are active now. As lists:
        {areas.map(({ key, label }, k) => (
          <Fragment key={key}>
            {k ? ' · ' : ' '}
            <a className="text-primary no-underline hover:underline" href={link(topicHref(key))}>
              {label}
            </a>
          </Fragment>
        ))}
        .
      </p>
    </div>
  );
}
