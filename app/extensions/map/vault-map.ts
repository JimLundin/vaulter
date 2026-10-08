// The vault as one picture: every topical note a dot, coloured by its area, sized by how connected it is;
// body links and typed relations as edges. The layout is deterministic (seeded), so the map doesn't move
// between loads; app/legacy/graph-view.ts adds pan, zoom and focus.
import { facet, titleOf, excerptOf, hrefOf, asList, type Note } from '../notes/model/fields.ts';
import type { Schema } from '../notes/model/schema.ts';
import type { Backlink } from '../graph/model/graph.ts';

/** On-screen scales (px per map unit) at which labels can appear; see the label pass below. */
const SCALES = [0.35, 0.5, 0.7, 1, 1.4, 2, 2.8, 4];

export interface MapNode {
  i: number;
  id: string;
  title: string;
  href: string;
  summary: string;
  area: string;
  type: string;
  status: string;
  degree: number;
  r: number;
  x: number;
  y: number;
  tier: number;
  labelAt: number;
  labelPos: 'b' | 't' | 'r' | 'l';
}
export interface MapEdge {
  a: number;
  b: number;
  link: boolean;
  rel: string[];
}

// Small seeded PRNG so every build lays the map out the same way.
const rng = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export type VaultMap = ReturnType<typeof layoutMap>;

/**
 * Lay out the topical notes. Called once per vault (derive.ts); every local map reads the same layout.
 * Plain data (notes by id), so it can be computed in a worker and passed back.
 */
export function layoutMap(
  notes: Note[],
  backlinks: Map<string, Backlink[]>,
  { areas, predicates }: Schema,
) {
  const topical = [...notes].sort((a, b) => a.id.localeCompare(b.id));
  const idx = new Map(topical.map((n, i) => [n.id, i]));

  // Edges: one per pair of notes, carrying whether the text links them and which relations they state.
  const edges = new Map<string, MapEdge>();
  const edge = (i: number, j: number) => {
    const [a, b] = i < j ? [i, j] : [j, i];
    const k = `${a}|${b}`;
    let e = edges.get(k);
    if (!e) {
      e = { a, b, link: false, rel: [] };
      edges.set(k, e);
    }
    return e;
  };
  for (const [to, list] of backlinks) {
    const j = idx.get(to);
    if (j == null) continue;
    for (const bl of list) {
      const i = idx.get(bl.from.id);
      if (i != null && i !== j) edge(i, j).link = true;
    }
  }
  topical.forEach((n, i) => {
    const rel = n.data.relations;
    if (!rel || typeof rel !== 'object') return;
    for (const [p, targets] of Object.entries(rel)) {
      const def = predicates[p];
      if (!def) continue;
      for (const t of asList(targets)) {
        const j = idx.get(t);
        if (j == null || j === i) continue;
        edge(i, j).rel.push(`${titleOf(n)} ${def.label.toLowerCase()} ${titleOf(topical[j])}`);
      }
    }
  });
  const E = [...edges.values()];

  const degree = new Array(topical.length).fill(0);
  for (const e of E) {
    degree[e.a]++;
    degree[e.b]++;
  }

  const nodes: MapNode[] = topical.map((n, i) => ({
    i,
    id: n.id,
    title: titleOf(n),
    href: hrefOf(n),
    summary: excerptOf(n, 200),
    area: facet(n, 'area'),
    type: String(n.data.type ?? ''),
    status: facet(n, 'status'),
    degree: degree[i],
    r: Math.min(4 + Math.sqrt(degree[i]) * 2.1, 19),
    x: 0,
    y: 0,
    tier: 3,
    labelAt: 99,
    labelPos: 'b',
  }));

  // Labels: the most connected notes and the hubs always; more as you zoom in.
  const ranked = [...nodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title));
  ranked.forEach((n, k) => {
    n.tier = k < 22 || n.type === 'moc' ? 1 : k < 70 ? 2 : 3;
  });

  // Layout: force-directed, with each area pulled toward its own anchor so the areas read as regions.
  const areaIx = (a: string) => areas.findIndex((x) => x.key === a);
  const R = 300;
  const anchor = (n: MapNode) => {
    const k = areaIx(n.area);
    if (k < 0) return { x: 0, y: 0 };
    const ang = (k / areas.length) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(ang) * R, y: Math.sin(ang) * R };
  };
  const rand = rng(7);
  const anchors = nodes.map(anchor);
  nodes.forEach((n, i) => {
    n.x = anchors[i].x + (rand() - 0.5) * 160;
    n.y = anchors[i].y + (rand() - 0.5) * 160;
  });

  const STEPS = 600;
  const N = nodes.length;
  const fx = new Float64Array(N);
  const fy = new Float64Array(N);
  for (let it = 0; it < STEPS; it++) {
    const temp = 1 - it / STEPS;
    fx.fill(0);
    fy.fill(0);
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const gap = Math.max(d - a.r - b.r, 2);
        const f = 1400 / (gap * gap) + (gap < 8 ? (8 - gap) * 0.8 : 0);
        dx /= d;
        dy /= d;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    for (const e of E) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const same = a.area === b.area;
      const L = (e.rel.length ? 34 : 48) + a.r + b.r;
      const k = (same ? 0.05 : 0.012) * (e.rel.length ? 1.5 : 1);
      const f = (d - L) * k;
      fx[e.a] += (dx / d) * f;
      fy[e.a] += (dy / d) * f;
      fx[e.b] -= (dx / d) * f;
      fy[e.b] -= (dy / d) * f;
    }
    const step = 14 * temp + 0.4;
    nodes.forEach((n, i) => {
      fx[i] += (anchors[i].x - n.x) * 0.02;
      fy[i] += (anchors[i].y - n.y) * 0.02;
      const m = Math.hypot(fx[i], fy[i]);
      if (m > step) {
        fx[i] *= step / m;
        fy[i] *= step / m;
      }
      n.x += fx[i];
      n.y += fy[i];
    });
  }

  // Fit: integer-ish coordinates and a padded viewBox.
  const pad = 70;
  const minX = Math.min(...nodes.map((n) => n.x - n.r)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + n.r)) + pad;
  const minY = Math.min(...nodes.map((n) => n.y - n.r)) - pad;
  const maxY = Math.max(...nodes.map((n) => n.y + n.r)) + pad;
  for (const n of nodes) {
    n.x = Math.round((n.x - minX) * 10) / 10;
    n.y = Math.round((n.y - minY) * 10) / 10;
  }
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  // Region labels: outward from the map's centre, just beyond the edge of each area's cluster.
  const cx0 = nodes.reduce((s, n) => s + n.x, 0) / N;
  const cy0 = nodes.reduce((s, n) => s + n.y, 0) / N;
  const regions = areas
    .map(({ key, label }, k) => {
      const list = nodes.filter((n) => n.area === key);
      if (!list.length) return null;
      const cx = list.reduce((s, n) => s + n.x, 0) / list.length;
      const cy = list.reduce((s, n) => s + n.y, 0) / list.length;
      let ux = cx - cx0;
      let uy = cy - cy0;
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul;
      uy /= ul;
      // Reach: how far the cluster's core (its nearer 85%) extends along that direction.
      const proj = list.map((n) => (n.x - cx) * ux + (n.y - cy) * uy + n.r).sort((a, b) => a - b);
      const reach = proj[Math.floor(proj.length * 0.85)] + 34;
      const x = Math.min(Math.max(cx + ux * reach, 60), width - 60);
      const y = Math.min(Math.max(cy + uy * reach, 20), height - 12);
      return { key, label, k, count: list.length, x: Math.round(x), y: Math.round(y) };
    })
    .filter(Boolean) as {
    key: string;
    label: string;
    k: number;
    count: number;
    x: number;
    y: number;
  }[];

  // Labels: each note gets the smallest on-screen scale (px per map unit) at which its label fits
  // without overlapping a more connected note's label, a region label or another dot. The viewer shows a
  // label once the map is zoomed to that scale, so zooming in reveals more names instead of piling them up.
  // A box is an anchor in map units (ax, ay) plus an offset in screen px (ox, oy) to its centre, w × h px.
  interface Box {
    ax: number;
    ay: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
  }
  const placed: (Box & { s: number })[] = regions.map((r) => ({
    s: 0,
    ax: r.x,
    ay: r.y,
    ox: 0,
    oy: 0,
    w: r.label.length * 9.5 + 16,
    h: 20,
  }));
  const over = (p: Box, q: Box, z: number) =>
    Math.abs((p.ax - q.ax) * z + p.ox - q.ox) < (p.w + q.w) / 2 &&
    Math.abs((p.ay - q.ay) * z + p.oy - q.oy) < (p.h + q.h) / 2;
  const outside = (b: Box, s: number) => {
    const x = b.ax * s + b.ox;
    const y = b.ay * s + b.oy;
    return (
      x - b.w / 2 < 2 ||
      x + b.w / 2 > width * s - 2 ||
      y - b.h / 2 < 2 ||
      y + b.h / 2 > height * s - 2
    );
  };
  const hits = (s: number, b: Box, self: MapNode) =>
    outside(b, s) ||
    // Two labels are both visible from the larger of their two scales on, and overlap most there.
    placed.some((p) => over(p, b, Math.max(p.s, s))) ||
    nodes.some(
      (d) =>
        d !== self &&
        over({ ax: d.x, ay: d.y, ox: 0, oy: 0, w: d.r * 1.4 * s, h: d.r * 1.4 * s }, b, s),
    );
  // Candidate spots, in order of preference: under the dot, above it, right, left.
  const spots = (n: MapNode) => {
    const w = n.title.length * 6.8 + 8;
    const h = 16;
    const g = 4;
    return [
      { pos: 'b', b: { ax: n.x, ay: n.y + n.r, ox: 0, oy: g + h / 2, w, h } },
      { pos: 't', b: { ax: n.x, ay: n.y - n.r, ox: 0, oy: -(g + h / 2), w, h } },
      { pos: 'r', b: { ax: n.x + n.r, ay: n.y, ox: g + w / 2, oy: 0, w, h } },
      { pos: 'l', b: { ax: n.x - n.r, ay: n.y, ox: -(g + w / 2), oy: 0, w, h } },
    ] as const;
  };
  for (const n of ranked) {
    placing: for (const s of SCALES)
      for (const c of spots(n)) {
        if (!hits(s, c.b, n)) {
          n.labelAt = s;
          n.labelPos = c.pos;
          placed.push({ s, ...c.b });
          break placing;
        }
      }
  }

  return { nodes, edges: E, width, height, regions };
}
