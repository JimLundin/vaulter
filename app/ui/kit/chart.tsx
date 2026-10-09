// Charts: one series each, drawn the same way everywhere (thin marks, the current period in the accent
// and the rest a step quieter, one label where the story is, a tooltip on every mark, and a table for
// screen readers). What an extension charts is its own; how it looks is the kit's.
import { type CSSProperties, type PointerEvent, useState } from 'react';
import { cn } from './lib/utils.ts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './parts/tooltip.tsx';

const number = (v: number) =>
  v.toLocaleString('en-GB', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 });

function Table({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface BarsProps {
  /** One bar each, in order, each label its own: a week, a day. */
  data: { label: string; value: number }[];
  /** What it shows, for screen readers and the table: "Kilometres run per week". */
  label: string;
  /** After each value: "km". */
  unit?: string;
  /** The bar the story is about (the current period): in the accent, with its value. The last by
   * default. */
  highlight?: number;
  size?: 'sm' | 'md';
}

/** Columns from one baseline: how much, per period. */
export function Bars({ data, label, unit, highlight = data.length - 1, size = 'sm' }: BarsProps) {
  const max = Math.max(0, ...data.map((d) => d.value)) || 1;
  const said = (v: number) => (unit ? `${number(v)} ${unit}` : number(v));
  // Every label while they fit; else the first, the last and the highlighted one.
  const shown = (i: number) =>
    data.length <= 8 || i === 0 || i === data.length - 1 || i === highlight;
  return (
    <TooltipProvider delayDuration={0}>
      <figure aria-label={label} className="m-0 flex flex-col gap-1.5">
        <div className="overflow-x-auto">
          <div data-chart-columns="" style={{ '--chart-count': data.length } as CSSProperties}>
            <div
              className={cn(
                'flex items-end gap-0.5 border-b border-border',
                size === 'sm' ? 'h-24' : 'h-40',
              )}
            >
              {data.map((d, i) => (
                <Tooltip key={d.label}>
                  <TooltipTrigger
                    render={
                      <button
                        data-touch-target=""
                        type="button"
                        aria-label={`${d.label}: ${said(d.value)}`}
                        className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1 border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {i === highlight ? (
                          <span className="text-caption font-medium text-foreground tabular-nums">
                            {number(d.value)}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'w-full max-w-6 rounded-t-[4px]',
                            i === highlight ? 'bg-chart-accent' : 'bg-chart-muted',
                          )}
                          style={{
                            height: d.value > 0 ? `max(2px, ${(d.value / max) * 82}%)` : 0,
                          }}
                        />
                      </button>
                    }
                  />
                  <TooltipContent>
                    <span className="font-semibold">{said(d.value)}</span> · {d.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="flex gap-0.5" aria-hidden={true}>
              {data.map((d, i) => (
                <span
                  key={d.label}
                  className="min-w-0 flex-1 truncate text-center text-caption text-muted-foreground"
                >
                  {shown(i) ? d.label : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Table caption={label} rows={data.map((d) => [d.label, said(d.value)])} />
      </figure>
    </TooltipProvider>
  );
}

export interface SparklineProps {
  values: number[];
  /** Each value's label, for the readout and the table: dates. */
  labels?: string[];
  label: string;
  unit?: string;
}

/** A trend in a line's height: beside a number, in a panel. The latest point is marked. */
export function Sparkline({ values, labels, label, unit }: SparklineProps) {
  const [at, setAt] = useState<number | undefined>(undefined);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 100);
  const y = (v: number) => 90 - ((v - min) / span) * 80;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const said = (i: number) => (unit ? `${number(values[i])} ${unit}` : number(values[i]));
  const nameOf = (i: number) => labels?.[i] ?? String(i + 1);
  const last = values.length - 1;
  const move = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.round(((e.clientX - r.left) / r.width) * last));
  };
  const dot = (i: number, accent: boolean) => (
    <span
      className={cn(
        'pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background',
        accent ? 'bg-chart-accent' : 'bg-chart-muted',
      )}
      style={{ left: `${x(i)}%`, top: `${y(values[i])}%` }}
    />
  );
  return (
    <figure
      aria-label={label}
      className="relative m-0 h-10 w-full touch-none"
      onPointerMove={move}
      onPointerLeave={() => setAt(undefined)}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden={true}
      >
        <polygon points={`0,100 ${line} 100,100`} className="fill-chart-muted/10" />
        <polyline
          points={line}
          className="fill-none stroke-chart-muted"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {dot(last, true)}
      {at === undefined ? null : (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-border"
            style={{ left: `${x(at)}%` }}
          />
          {at === last ? null : dot(at, false)}
          <span
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground"
            style={{ left: `${Math.min(85, Math.max(15, x(at)))}%` }}
          >
            <span className="font-semibold">{said(at)}</span> · {nameOf(at)}
          </span>
        </>
      )}
      <Table caption={label} rows={values.map((_, i) => [nameOf(i), said(i)])} />
    </figure>
  );
}
