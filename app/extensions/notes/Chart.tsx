// Small line or bar chart from numbers kept in the note.
// <Chart kind="line" title="Asking price" unit="kSEK" x={["Jun","Jul"]} series={[{name: "Median", values: [4200, 4350]}]} />
interface Series {
  name: string;
  values: (number | null)[];
}
interface Props {
  kind?: 'line' | 'bar';
  title?: string;
  unit?: string;
  x?: string[];
  series?: Series[];
}

const MAX = 4; // categorical slots; more series belong in separate charts

export function Chart({ kind = 'line', title = '', unit = '', x = [], series: all = [] }: Props) {
  const series = all.slice(0, MAX);
  const W = 640;
  const H = 260;
  const m = { t: 16, r: kind === 'line' && series.length > 1 ? 96 : 20, b: 32, l: 48 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const vals = series.flatMap((s) => s.values).filter((v): v is number => typeof v === 'number');
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (kind === 'bar') lo = Math.min(0, lo);
  if (!vals.length) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    hi = lo + 1;
  }
  // "nice" ticks
  const span = hi - lo;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!;
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = y0; v <= y1 + step / 2; v += step) ticks.push(+v.toFixed(10));
  const yAt = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const fmt = (v: number) =>
    Math.abs(v) >= 1e4 ? v.toLocaleString('en-US') : String(+v.toFixed(2));
  const withUnit = (v: number) => fmt(v) + (unit ? ` ${unit}` : '');

  const n = Math.max(1, x.length);
  const band = iw / n;
  const xAt = (i: number) =>
    kind === 'line' ? m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)) : m.l + band * i + band / 2;
  const color = (i: number) => `var(--s${i + 1})`;

  // bars: grouped, 2px gap between adjacent fills, 4px rounded data end anchored to baseline
  const groupW = Math.min(band * 0.72, 28 * series.length + 2 * (series.length - 1));
  const barW = (groupW - 2 * (series.length - 1)) / series.length;
  const barPath = (x0: number, v: number) => {
    const yb = yAt(Math.max(0, y0) === 0 ? 0 : y0);
    const yv = yAt(v);
    const up = yv < yb;
    const top = Math.min(yb, yv);
    const h = Math.abs(yb - yv);
    const r = Math.min(4, h, barW / 2);
    if (h === 0) return '';
    return up
      ? `M${x0},${yb}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${yb}Z`
      : `M${x0},${yb}V${top + h - r}Q${x0},${top + h} ${x0 + r},${top + h}H${x0 + barW - r}Q${x0 + barW},${top + h} ${x0 + barW},${top + h - r}V${yb}Z`;
  };
  const linePath = (s: Series) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (typeof v !== 'number') {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const lastIdx = (s: Series) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (typeof s.values[i] === 'number') return i;
    return -1;
  };
  // thin out x labels so they never collide
  const every = Math.max(1, Math.ceil(n / Math.floor(iw / 56)));
  const tip = (s: Series, i: number, v: number) =>
    `${series.length > 1 ? `${s.name} · ` : ''}${x[i]}: ${withUnit(v)}`;

  return (
    <figure className="chart">
      {title ? (
        <figcaption>
          {title}
          {!!unit && <span> ({unit})</span>}
        </figcaption>
      ) : null}
      {series.length > 1 && (
        <ul className="legend">
          {series.map((s, i) => (
            <li key={s.name}>
              <i style={{ background: color(i) }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title || 'Chart'}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={m.l}
              x2={W - m.r}
              y1={yAt(t)}
              y2={yAt(t)}
              className={t === 0 ? 'zero' : 'grid'}
            />
            <text x={m.l - 8} y={yAt(t)} className="ytick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {x.map(
          (lab, i) =>
            i % every === 0 && (
              // biome-ignore lint/suspicious/noArrayIndexKey: a chart is static and positional: index i is category x[i]
              <text key={i} x={xAt(i)} y={H - 10} className="xtick">
                {lab}
              </text>
            ),
        )}

        {kind === 'bar' &&
          series.map((s, si) =>
            s.values.map(
              (v, i) =>
                typeof v === 'number' && (
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: a chart is static and positional: index i is category x[i]
                    key={i}
                    d={barPath(xAt(i) - groupW / 2 + si * (barW + 2), v)}
                    fill={color(si)}
                    data-tip={tip(s, i, v)}
                  />
                ),
            ),
          )}

        {kind === 'line' &&
          series.map((s, si) => (
            <g key={s.name}>
              <path
                d={linePath(s)}
                fill="none"
                stroke={color(si)}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map(
                (v, i) =>
                  typeof v === 'number' && (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a chart is static and positional: index i is category x[i]
                    <g key={i}>
                      <circle cx={xAt(i)} cy={yAt(v)} r="4" fill={color(si)} className="pt" />
                      <circle
                        cx={xAt(i)}
                        cy={yAt(v)}
                        r="12"
                        fill="transparent"
                        data-tip={tip(s, i, v)}
                      />
                    </g>
                  ),
              )}
              {series.length > 1 && lastIdx(s) >= 0 && (
                <text
                  x={xAt(lastIdx(s)) + 10}
                  y={yAt(s.values[lastIdx(s)] as number)}
                  className="dlabel"
                >
                  {s.name}
                </text>
              )}
            </g>
          ))}
      </svg>
      <details>
        <summary>Data</summary>
        <table>
          <thead>
            <tr>
              <th />
              {series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {x.map((lab, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a chart is static and positional: index i is category x[i]
              <tr key={i}>
                <td>{lab}</td>
                {series.map((s) => (
                  <td key={s.name}>
                    {typeof s.values[i] === 'number' ? withUnit(s.values[i] as number) : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {all.length > MAX && (
        <p className="note">
          Showing the first {MAX} of {all.length} series; split the rest into another chart.
        </p>
      )}
    </figure>
  );
}
