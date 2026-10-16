import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cn } from './lib/utils.ts';
import { useLayout } from './hooks/use-layout.ts';
import { PageControls } from './page-controls.tsx';
import { Button } from './parts/button.tsx';
import { Row } from './parts/layout.tsx';
import { Icon } from './icons.tsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './parts/dropdown-menu.tsx';

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly column?: number;
  readonly detail?: string;
  readonly group?: string;
  readonly connections?: number;
  readonly muted?: boolean;
  readonly color?: string;
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
  fill = false,
  legend,
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
  layout?: 'radial' | 'lanes' | 'map';
  viewKey?: string;
  /** Fill the available height in a flex workspace. */
  fill?: boolean;
  legend?: readonly { label: string; color: string }[];
}) {
  const marker = useId().replaceAll(':', '');
  if (layout === 'map')
    return (
      <NetworkMap
        label={label}
        nodes={nodes}
        edges={edges}
        onSelect={onSelect}
        viewKey={viewKey}
        fill={fill}
        legend={legend}
      />
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

// Springs follow caller-supplied edges; repulsion and collision separate records. No category centers.
function forcePositions(nodes: readonly NetworkNode[], edges: readonly NetworkEdge[]) {
  const points = nodes.map((node, index) => ({
    id: node.id,
    x: 500 + Math.cos(index * 2.399) * Math.sqrt(index + 1) * 20,
    y: 350 + Math.sin(index * 2.399) * Math.sqrt(index + 1) * 20,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
  }));
  const byId = new Map(points.map((point) => [point.id, point]));
  const degree = new Map(
    nodes.map((node) => [
      node.id,
      node.connections ??
        edges.filter((edge) => edge.source === node.id || edge.target === node.id).length,
    ]),
  );
  for (let step = 0; step < 360; step++) {
    for (const point of points) {
      point.fx = (500 - point.x) * 0.004;
      point.fy = (350 - point.y) * 0.004;
    }
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const gap = 18 + Math.sqrt(degree.get(a.id)!) * 3 + Math.sqrt(degree.get(b.id)!) * 3;
        const force = 1500 / (distance * distance) + Math.max(0, gap - distance) * 0.14;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.fx -= fx;
        a.fy -= fy;
        b.fx += fx;
        b.fy += fy;
      }
    for (const edge of edges) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!(a && b) || a === b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = 65 + Math.sqrt((degree.get(a.id) ?? 0) + (degree.get(b.id) ?? 0)) * 7;
      const force = (distance - desired) * 0.032;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.fx += fx;
      a.fy += fy;
      b.fx -= fx;
      b.fy -= fy;
    }
    const cooling = 1 - step / 420;
    for (const point of points) {
      point.vx = (point.vx + point.fx * cooling) * 0.72;
      point.vy = (point.vy + point.fy * cooling) * 0.72;
      point.x += Math.max(-10, Math.min(10, point.vx));
      point.y += Math.max(-10, Math.min(10, point.vy));
    }
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const scale = Math.min(
    850 / Math.max(1, Math.max(...xs) - Math.min(...xs)),
    560 / Math.max(1, Math.max(...ys) - Math.min(...ys)),
  );
  return new Map(
    points.map((point) => [
      point.id,
      { x: 500 + (point.x - centerX) * scale, y: 350 + (point.y - centerY) * scale },
    ]),
  );
}

// Generic force map and viewport state. Record meaning remains with the caller.
function NetworkMap({
  label,
  nodes,
  edges,
  onSelect,
  viewKey,
  fill,
  legend,
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
  viewKey: string;
  fill: boolean;
  legend?: readonly { label: string; color: string }[];
}) {
  const compact = useLayout() === 'compact';
  const [views, setViews] = useState<Record<string, { zoom: number; left: number; top: number }>>(
    {},
  );
  const [moved, setMoved] = useState<Record<string, Record<string, { x: number; y: number }>>>({});
  const [hovered, setHovered] = useState<string>();
  const view = views[viewKey] ?? { zoom: 1, left: 0, top: 0 };
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [extent, setExtent] = useState({ width: 1000, height: 700 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setExtent({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const screenScale = Math.min(extent.width / 1000, extent.height / 700);
  const project = (point: { x: number; y: number }) => ({
    left: (extent.width - 1000 * screenScale) / 2 + point.x * screenScale,
    top: (extent.height - 700 * screenScale) / 2 + point.y * screenScale,
  });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const nodeDrag = useRef<{
    id: string;
    x: number;
    y: number;
    position: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const skipClick = useRef(false);
  const topology = JSON.stringify([
    nodes.map((node) => [node.id, node.connections]),
    edges.map((edge) => [edge.source, edge.target]),
  ]);
  const computed = useMemo(() => {
    const [nodeRows, edgeRows] = JSON.parse(topology) as [
      Array<[string, number?]>,
      Array<[string, string]>,
    ];
    return forcePositions(
      nodeRows.map(([id, connections]) => ({ id, label: id, connections })),
      edgeRows.map(([source, target], index) => ({ id: String(index), source, target, label: '' })),
    );
  }, [topology]);
  const positions = new Map(computed);
  for (const [id, position] of Object.entries(moved[viewKey] ?? {}))
    if (positions.has(id)) positions.set(id, position);
  const degree = new Map(
    nodes.map((node) => [
      node.id,
      node.connections ??
        edges.filter((edge) => edge.source === node.id || edge.target === node.id).length,
    ]),
  );
  const size = (node: NetworkNode) =>
    (6 + Math.min(28, Math.sqrt(degree.get(node.id) ?? 0) * 4)) *
    (view.zoom === 1 && extent.width < 600 ? 0.65 : 1);
  const colors = { topic: '#7c83e8', statement: '#8a8f9b', source: '#39ad93', question: '#de9b44' };
  const active = hovered ?? nodes.find((node) => node.selected)?.id;
  const neighbors = new Set(
    edges
      .filter((edge) => edge.source === active || edge.target === active)
      .flatMap((edge) => [edge.source, edge.target]),
  );
  const changeZoom = (zoom: number) => {
    const frame = viewport.current;
    const content = canvas.current;
    const centerX =
      frame && content ? (view.left + frame.clientWidth / 2) / content.clientWidth : 0.5;
    const centerY =
      frame && content ? (view.top + frame.clientHeight / 2) / content.clientHeight : 0.5;
    setViews({
      ...views,
      [viewKey]: {
        zoom,
        left: zoom === 1 ? 0 : Math.max(0, centerX * zoom * 700 - (frame?.clientWidth ?? 0) / 2),
        top: zoom === 1 ? 0 : Math.max(0, centerY * zoom * 500 - (frame?.clientHeight ?? 0) / 2),
      },
    });
  };
  return (
    <figure
      aria-label={label}
      className={cn(
        'm-0 flex min-w-0 flex-col gap-2',
        fill && 'min-h-0 flex-1 px-[var(--page-inset)] pb-3',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {nodes.length} records ·{' '}
          {view.zoom === 1 ? 'Fit · relationship layout' : `Detail · ${view.zoom}×`}
        </span>
        <PageControls
          actions={
            <Row gap="xs">
              <Button
                aria-label="Fit map"
                title="Fit map"
                iconOnly={compact}
                variant="outline"
                onClick={() => changeZoom(1)}
              >
                {compact ? <Icon name="fit" /> : 'Fit map'}
              </Button>
              {compact ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        iconOnly={true}
                        variant="ghost"
                        aria-label="Graph view"
                        title="Graph view"
                      />
                    }
                  >
                    <Icon name="map" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="left"
                    align="end"
                    sideOffset={12}
                    aria-label="Graph view"
                  >
                    <DropdownMenuItem
                      disabled={view.zoom === 4}
                      onClick={() => changeZoom(Math.min(4, view.zoom + 1))}
                    >
                      <Icon name="zoom-in" />
                      Zoom in graph
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={view.zoom === 1}
                      onClick={() => changeZoom(Math.max(1, view.zoom - 1))}
                    >
                      <Icon name="zoom-out" />
                      Zoom out graph
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMoved({ ...moved, [viewKey]: {} })}>
                      <Icon name="undo" />
                      Reset positions
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button
                    aria-label="Zoom out graph"
                    iconOnly={true}
                    variant="outline"
                    disabled={view.zoom === 1}
                    onClick={() => changeZoom(Math.max(1, view.zoom - 1))}
                  >
                    <Icon name="zoom-out" />
                  </Button>
                  <Button
                    aria-label="Zoom in graph"
                    iconOnly={true}
                    variant="outline"
                    disabled={view.zoom === 4}
                    onClick={() => changeZoom(Math.min(4, view.zoom + 1))}
                  >
                    <Icon name="zoom-in" />
                  </Button>
                  <Button variant="outline" onClick={() => setMoved({ ...moved, [viewKey]: {} })}>
                    Reset positions
                  </Button>
                </>
              )}
            </Row>
          }
        />
      </div>
      <div
        ref={(element) => {
          viewport.current = element;
          if (element) {
            element.scrollLeft = view.left;
            element.scrollTop = view.top;
          }
        }}
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
        onScroll={(event) => {
          const { scrollLeft: left, scrollTop: top } = event.currentTarget;
          setViews((previous) => ({ ...previous, [viewKey]: { ...view, left, top } }));
        }}
        className={cn(
          'max-w-full overflow-auto rounded-xl border border-border bg-muted/10',
          fill ? 'min-h-0 flex-1' : 'h-[460px] md:h-[580px]',
        )}
      >
        <div
          ref={canvas}
          className="relative"
          style={{
            width: view.zoom === 1 ? '100%' : `${view.zoom * 700}px`,
            height: view.zoom === 1 ? '100%' : `${view.zoom * 500}px`,
          }}
        >
          <svg
            viewBox="0 0 1000 700"
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {edges.map((edge) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              const muted =
                nodes.find((node) => node.id === edge.source)?.muted ||
                nodes.find((node) => node.id === edge.target)?.muted;
              return a && b ? (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  strokeWidth={edge.source === active || edge.target === active ? 2 : 1}
                  className={
                    muted
                      ? 'text-muted-foreground/5'
                      : edge.source === active || edge.target === active
                        ? 'text-foreground/70'
                        : 'text-muted-foreground/25'
                  }
                />
              ) : null;
            })}
          </svg>
          {nodes.map((node) => {
            const position = positions.get(node.id)!;
            return (
              <span
                key={node.id}
                style={{
                  ...project(position),
                  backgroundColor: node.color ?? colors[node.tone ?? 'statement'],
                  width: size(node),
                  height: size(node),
                }}
                className={cn(
                  'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full',
                  node.muted
                    ? 'opacity-15'
                    : active && node.id !== active && !neighbors.has(node.id)
                      ? 'opacity-40'
                      : '',
                )}
              />
            );
          })}
          {nodes
            .filter(
              (node) =>
                !node.muted &&
                (view.zoom > 1 ||
                  node.tone === 'topic' ||
                  node.selected ||
                  nodes.length < 40 ||
                  size(node) > 18),
            )
            .map((node) => {
              const position = positions.get(node.id)!;
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-label={`Explore ${node.label}`}
                  aria-pressed={!!node.selected}
                  title={`${node.label} · ${degree.get(node.id)} connections`}
                  onPointerEnter={() => setHovered(node.id)}
                  onPointerLeave={() => setHovered(undefined)}
                  onPointerDown={(event) => {
                    skipClick.current = false;
                    nodeDrag.current = {
                      id: node.id,
                      x: event.clientX,
                      y: event.clientY,
                      position,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const dragging = nodeDrag.current;
                    if (!dragging || dragging.id !== node.id) return;
                    const dx = event.clientX - dragging.x;
                    const dy = event.clientY - dragging.y;
                    if (Math.hypot(dx, dy) < 6 && !dragging.moved) return;
                    dragging.moved = true;
                    setMoved((previous) => ({
                      ...previous,
                      [viewKey]: {
                        ...previous[viewKey],
                        [node.id]: {
                          x: Math.max(30, Math.min(970, dragging.position.x + dx / screenScale)),
                          y: Math.max(30, Math.min(670, dragging.position.y + dy / screenScale)),
                        },
                      },
                    }));
                  }}
                  onPointerUp={() => {
                    skipClick.current = nodeDrag.current?.moved ?? false;
                    nodeDrag.current = null;
                  }}
                  onPointerCancel={() => {
                    nodeDrag.current = null;
                  }}
                  onClick={() => {
                    if (skipClick.current) {
                      skipClick.current = false;
                      return;
                    }
                    onSelect(node.id);
                  }}
                  style={project(position)}
                  className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    style={{
                      backgroundColor: node.color ?? colors[node.tone ?? 'statement'],
                      width: size(node),
                      height: size(node),
                    }}
                    className={cn(
                      'rounded-full ring-2 ring-background',
                      node.selected && 'ring-4 ring-ring/40',
                    )}
                  />
                  {(node.id === active ||
                    (view.zoom > 1 && node.tone === 'topic') ||
                    nodes.length < 12) && (
                    <span className="pointer-events-none absolute top-full max-w-40 rounded bg-background/95 px-1 text-center text-xs leading-tight text-foreground">
                      {node.label.length > 52 ? `${node.label.slice(0, 52)}…` : node.label}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(legend ?? Object.entries(colors).map(([label, color]) => ({ label, color }))).map(
          ({ label, color }) => (
            <span key={label} className="flex items-center gap-1">
              <span style={{ backgroundColor: color }} className="size-2 rounded-full" />
              {label}
            </span>
          ),
        )}
        <span>Size = total connections · hover or select to trace links</span>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Drag a node to reposition it. Zoom in for smaller records; swipe or scroll the detailed map.
        Tap to inspect.
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
