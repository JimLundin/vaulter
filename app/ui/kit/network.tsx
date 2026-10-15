import { useId } from 'react';
import type { CSSProperties } from 'react';
import { cn } from './lib/utils.ts';

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly selected?: boolean;
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
}: {
  label: string;
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  onSelect: (id: string) => void;
}) {
  const marker = useId().replaceAll(':', '');
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
