// The vault as a map: every topical note a dot coloured by area and sized by connections, links and
// relations as edges (layout: core/vault-map.ts). app/legacy/graph-view.ts adds filters, pan/zoom and focus.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { useEffect, useRef } from 'react';
import type { VaultMap } from '../../../core/vault-map.ts';
import { topicHref } from '../../../core/note-fields.ts';
import { initMap } from './graph-view.ts';
import { useHeavy, useSchema } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './map.css';

const f = (v: number) => Math.round(v * 10) / 10;

export function MapView() {
  const map = useHeavy('map');
  if (!map)
    return (
      <div className="v-map">
        <h1>Map</h1>
        <p className="lede">Laying out the map…</p>
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
      <div className="meta">
        <span className="chip">map</span>
      </div>
      <h1>Map</h1>
      <p className="lede">
        {nodes.length} notes and {edges.length} connections, {relCount} of them typed relations.
        Coloured by area; bigger dots are more connected. Tap a dot to see its neighbourhood.
      </p>
      <div className="vmap" ref={box}>
        <div className="vm-bar">
          <fieldset className="vm-areas" aria-label="Areas">
            {areas.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`vm-chip a-${key}`}
                data-area={key}
                aria-pressed="true"
              >
                <i />
                {label}
                <small>{counts[key]}</small>
              </button>
            ))}
          </fieldset>
          <div className="vm-tools">
            <button
              type="button"
              className="vm-btn"
              data-edges={true}
              aria-pressed="false"
              title="Show only typed relations"
            >
              Relations only
            </button>
            <button type="button" className="vm-btn" data-zoom="1" aria-label="Zoom in">
              +
            </button>
            <button type="button" className="vm-btn" data-zoom="-1" aria-label="Zoom out">
              &minus;
            </button>
            <button type="button" className="vm-btn" data-zoom="0" aria-label="Reset view">
              Reset
            </button>
          </div>
        </div>
        <svg
          className="vm-svg"
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
        <div className="vm-card" hidden={true} aria-live="polite" />
      </div>
      <p className="vm-foot">
        Solid lines are typed relations (<code>relations</code> in a note's frontmatter); faint
        lines are links in the text. Rings mark notes that are active now. As lists:
        {areas.map(({ key, label }, k) => (
          <Fragment key={key}>
            {k ? ' · ' : ' '}
            <a href={link(topicHref(key))}>{label}</a>
          </Fragment>
        ))}
        .
      </p>
    </div>
  );
}
