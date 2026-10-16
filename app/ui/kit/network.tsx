import { useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cn } from './lib/utils.ts';

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly column?: number;
  readonly detail?: string;
  readonly group?: string;
  readonly tone?: 'topic' | 'statement' | 'source' | 'question';
}
export interface NetworkEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

/** A bounded, keyboard-accessible neighborhood diagram. Owners supply meaning and selection. */
export function NetworkDiagram({
  label,
  nodes,
  edges,
  onSelect,
  layout = 'radial',
  viewKey = 'global',
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
  layout?: 'radial' | 'lanes' | 'map';
  viewKey?: string;
}) {
  const marker = useId().replaceAll(':', '');
  if (layout === 'map')
    return (
      <NetworkMap label={label} nodes={nodes} edges={edges} onSelect={onSelect} viewKey={viewKey} />
    );
  if (layout === 'lanes') {
    const columns = [...new Set(nodes.map((node) => node.column ?? 0))].sort((a, b) => a - b);
    const width = Math.max(760, columns.length * 290);
    const height = Math.max(
      340,
      ...columns.map(
        (column) => nodes.filter((node) => (node.column ?? 0) === column).length * 160 + 40,
      ),
    );
    const places = new Map(
      nodes.map((node) => {
        const peers = nodes.filter((peer) => (peer.column ?? 0) === (node.column ?? 0));
        return [
          node.id,
          { x: columns.indexOf(node.column ?? 0) * 290 + 30, y: peers.indexOf(node) * 160 + 30 },
        ];
      }),
    );
    return (
      <figure aria-label={label} className="m-0 min-w-0">
        <section
          aria-label="Scrollable investigation canvas"
          className="max-h-[560px] max-w-full overflow-auto rounded-xl border border-border bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="relative" style={{ width, height }}>
            <svg
              aria-hidden="true"
              width={width}
              height={height}
              className="absolute inset-0 text-muted-foreground"
            >
              <defs>
                <marker
                  id={marker}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const source = places.get(edge.source);
                const target = places.get(edge.target);
                if (!(source && target) || source.x === target.x) return null;
                const forward = target.x > source.x;
                const x1 = source.x + (forward ? 220 : 0);
                const x2 = target.x + (forward ? 0 : 220);
                const y1 = source.y + 60;
                const y2 = target.y + 60;
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={
                        nodes.some(
                          (node) =>
                            node.selected && (node.id === edge.source || node.id === edge.target),
                        )
                          ? '3'
                          : '1.5'
                      }
                      markerEnd={`url(#${marker})`}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                      textAnchor="middle"
                      fontSize="11"
                      fill="currentColor"
                      stroke="var(--background)"
                      strokeWidth="4"
                      paintOrder="stroke"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                aria-label={`Explore ${node.label}`}
                aria-pressed={!!node.selected}
                onClick={() => onSelect(node.id)}
                style={{ left: places.get(node.id)!.x, top: places.get(node.id)!.y }}
                className={cn(
                  'absolute flex h-[120px] w-[220px] flex-col gap-2 overflow-hidden rounded-xl border border-border bg-background p-3 text-left text-sm shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                  node.selected && 'border-primary ring-2 ring-primary/25',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">{node.detail}</span>
                <span className="line-clamp-4">{node.label}</span>
              </button>
            ))}
          </div>
        </section>
        <figcaption className="mt-2 text-sm text-muted-foreground">
          Select a record to read its text. Scroll to follow the visible branches.
        </figcaption>
        <ul className="sr-only" aria-label="Diagram connections">
          {edges.map((edge) => (
            <li key={edge.id}>
              {nodes.find((node) => node.id === edge.source)?.label} — {edge.label} →{' '}
              {nodes.find((node) => node.id === edge.target)?.label}
            </li>
          ))}
        </ul>
      </figure>
    );
  }
  const center = nodes.find((node) => node.selected) ?? nodes[0];
  const surrounding = nodes.filter((node) => node !== center);
  const positions = new Map<string, { x: number; y: number }>();
  if (center) positions.set(center.id, { x: 50, y: 50 });
  for (const [index, node] of surrounding.entries()) {
    const angle = (index / Math.max(1, surrounding.length)) * Math.PI * 2 - Math.PI / 2;
    positions.set(node.id, { x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 35 });
  }
  return (
    <figure aria-label={label} className="m-0 min-w-0">
      <div className="relative aspect-square w-full max-w-xl overflow-hidden rounded-xl border border-border bg-muted/20">
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full text-muted-foreground/50"
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!(source && target) || edge.source === edge.target) return null;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.hypot(dx, dy);
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x - (dx / distance) * 6}
                y2={target.y - (dy / distance) * 6}
                stroke="currentColor"
                strokeWidth="0.4"
                markerEnd={`url(#${marker})`}
              />
            );
          })}
        </svg>
        {nodes.map((node) => {
          const position = positions.get(node.id)!;
          return (
            <button
              key={node.id}
              type="button"
              aria-label={`Explore ${node.label}`}
              aria-pressed={!!node.selected}
              onClick={() => onSelect(node.id)}
              style={{ left: `${position.x}%`, top: `${position.y}%` } as CSSProperties}
              className={cn(
                'absolute flex min-h-11 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-border bg-background px-2 py-2 text-center text-xs leading-snug shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                node.selected &&
                  'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <span className="line-clamp-3 break-words">{node.label}</span>
            </button>
          );
        })}
      </div>
      <figcaption className="mt-2 text-sm text-muted-foreground">
        Select a subject to follow its connections.
      </figcaption>
      <ul className="sr-only" aria-label="Diagram connections">
        {edges.map((edge) => (
          <li key={edge.id}>
            {nodes.find((node) => node.id === edge.source)?.label} — {edge.label} →{' '}
            {nodes.find((node) => node.id === edge.target)?.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

// Generic map geometry and viewport state. Record meaning remains with the caller.
function NetworkMap({
  label,
  nodes,
  edges,
  onSelect,
  viewKey,
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
  viewKey: string;
}) {
  const [views, setViews] = useState<Record<string, { zoom: number; left: number; top: number }>>(
    {},
  );
  const view = views[viewKey] ?? { zoom: 1, left: 0, top: 0 };
  const viewport = useRef<HTMLDivElement>(null);
  const cachedPositions = useRef(new Map<string, Map<string, { x: number; y: number }>>());
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const groups = [...new Set(nodes.map((node) => node.group ?? 'Records'))].sort();
  const selected = nodes.find((node) => node.selected);
  const local = viewKey !== 'global' && !viewKey.startsWith('atlas');
  const positions =
    cachedPositions.current.get(viewKey) ?? new Map<string, { x: number; y: number }>();
  cachedPositions.current.set(viewKey, positions);
  const centers = groups.map((group, index) => ({
    group,
    x: groups.length === 1 ? 500 : 230 + (index % 2) * 530,
    y: groups.length <= 2 ? 350 : 180 + Math.floor(index / 2) * 340,
  }));
  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    if (local && selected) {
      const index = nodes.indexOf(node);
      const ring = Math.ceil(index / 10);
      const angle = index * 2.399;
      positions.set(
        node.id,
        node.id === selected.id
          ? { x: 500, y: 350 }
          : {
              x: 500 + Math.cos(angle) * (120 + ring * 65),
              y: 350 + Math.sin(angle) * (100 + ring * 40),
            },
      );
    } else {
      const center = centers.find((entry) => entry.group === (node.group ?? 'Records'))!;
      const peers = nodes.filter((peer) => (peer.group ?? 'Records') === (node.group ?? 'Records'));
      const index = peers.indexOf(node);
      const radius = 30 + Math.sqrt(index) * 22;
      const angle = index * 2.399;
      positions.set(node.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius * 0.72,
      });
    }
  }
  const colors = { topic: '#536dce', statement: '#8a8f9b', source: '#299b88', question: '#cc8736' };
  const changeZoom = (zoom: number) => setViews({ ...views, [viewKey]: { ...view, zoom } });
  return (
    <figure aria-label={label} className="m-0 flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{view.zoom === 1 ? 'Overview · areas' : `Detail · ${view.zoom}×`}</span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Zoom out graph"
            disabled={view.zoom === 1}
            onClick={() => changeZoom(Math.max(1, view.zoom - 1))}
            className="min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Zoom in graph"
            disabled={view.zoom === 4}
            onClick={() => changeZoom(Math.min(4, view.zoom + 1))}
            className="min-h-11 min-w-11 rounded-lg border border-border bg-background px-3 disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              changeZoom(1);
              viewport.current?.scrollTo(0, 0);
            }}
            className="min-h-11 rounded-lg border border-border bg-background px-3"
          >
            Fit map
          </button>
        </div>
      </div>
      <div
        key={viewKey}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && !(event.target as Element).closest('button')) {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
            event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        ref={(element) => {
          viewport.current = element;
          if (element) {
            element.scrollLeft = view.left;
            element.scrollTop = view.top;
          }
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          const left = element.scrollLeft;
          const top = element.scrollTop;
          setViews((previous) => ({ ...previous, [viewKey]: { ...view, left, top } }));
        }}
        className="h-[460px] max-w-full overflow-auto rounded-xl border border-border bg-muted/20 md:h-[540px]"
      >
        <div
          className="relative"
          style={{
            width: view.zoom === 1 ? '100%' : `${view.zoom * 700}px`,
            height: view.zoom === 1 ? '100%' : `${view.zoom * 500}px`,
          }}
        >
          <svg
            viewBox="0 0 1000 700"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {!local &&
              centers.map((center) => (
                <g key={center.group}>
                  <ellipse
                    cx={center.x}
                    cy={center.y}
                    rx="220"
                    ry="150"
                    fill="currentColor"
                    className="text-muted-foreground/5"
                  />
                </g>
              ))}
            {edges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              return source && target ? (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="currentColor"
                  className={
                    selected && (edge.source === selected.id || edge.target === selected.id)
                      ? 'text-foreground/70'
                      : 'text-muted-foreground/20'
                  }
                  strokeWidth={
                    selected && (edge.source === selected.id || edge.target === selected.id) ? 2 : 1
                  }
                />
              ) : null;
            })}
          </svg>
          {!local &&
            centers.map((center) => (
              <span
                key={center.group}
                style={{ left: `${center.x / 10}%`, top: `${(center.y - 158) / 7}%` }}
                className="pointer-events-none absolute -translate-x-1/2 text-sm text-muted-foreground"
              >
                {center.group}
              </span>
            ))}
          {nodes.map((node) => {
            const position = positions.get(node.id)!;
            return (
              <span
                key={node.id}
                style={{
                  left: `${position.x / 10}%`,
                  top: `${position.y / 7}%`,
                  backgroundColor: colors[node.tone ?? 'statement'],
                }}
                className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              />
            );
          })}
          {nodes
            .filter((node) => view.zoom > 1 || node.tone === 'topic' || node.selected || local)
            .map((node) => {
              const position = positions.get(node.id)!;
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-label={`Explore ${node.label}`}
                  aria-pressed={!!node.selected}
                  title={node.label}
                  onClick={() => onSelect(node.id)}
                  style={{ left: `${position.x / 10}%`, top: `${position.y / 7}%` }}
                  className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    style={{ backgroundColor: colors[node.tone ?? 'statement'] }}
                    className={cn(
                      'size-2.5 rounded-full ring-2 ring-background',
                      node.selected && 'ring-4 ring-ring/40',
                    )}
                  />
                  {((node.tone === 'topic' && (view.zoom > 1 || nodes.length < 8)) ||
                    node.selected ||
                    (local && nodes.length < 12)) && (
                    <span className="absolute top-full max-w-28 rounded bg-background/90 px-1 text-center text-xs leading-tight text-foreground">
                      {node.label.length > 45 ? `${node.label.slice(0, 45)}…` : node.label}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Tap a topic to inspect or focus. Zoom in to select individual records; swipe or scroll to
        move the detailed map.
      </figcaption>
      <ul className="sr-only" aria-label="Map connections">
        {edges.map((edge) => (
          <li key={edge.id}>
            {nodes.find((node) => node.id === edge.source)?.label} — {edge.label} →{' '}
            {nodes.find((node) => node.id === edge.target)?.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
