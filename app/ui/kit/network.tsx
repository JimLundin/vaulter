import { useId } from 'react';
import type { CSSProperties } from 'react';
import { cn } from './lib/utils.ts';

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
  readonly column?: number;
  readonly detail?: string;
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
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
  layout?: 'radial' | 'lanes';
}) {
  const marker = useId().replaceAll(':', '');
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
