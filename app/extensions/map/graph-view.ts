// Interaction for the vault map: area filters, pan/zoom and focusing a note's neighbourhood, over the SVG
// that MapView.tsx renders (every dot is already a link).

import type { Area } from '../../../core/schema.ts';

/** Per dot, in node order: t title, h href, s summary, a area, y type, d degree. */
export interface MapCard {
  t: string;
  h: string;
  s: string;
  a: string;
  y: string;
  d: number;
}

/** Wires up one map; returns the cleanup. */
export function initMap(box: HTMLElement, data: MapCard[], areaOf: Map<string, Area>): () => void {
  {
    const off: (() => void)[] = [];
    const svg = box.querySelector<SVGSVGElement>('.vm-svg')!;
    const vp = box.querySelector('.vm-vp')!;
    const card = box.querySelector<HTMLElement>('.vm-card')!;
    const nodes = [...box.querySelectorAll<SVGAElement>('.vm-n')];
    const lines = [...box.querySelectorAll<SVGLineElement>('.vm-edges line')];
    const regions = [...box.querySelectorAll<SVGTextElement>('.vm-region')];
    const byI = new Map(nodes.map((n) => [+n.dataset.i!, n]));
    const labI = new Map(
      [...box.querySelectorAll<SVGTextElement>('.vm-l')].map((t) => [+t.dataset.i!, t]),
    );
    // A dot's state classes are mirrored onto its label, which lives in a layer above all dots.
    const mark = (i: number, cls: string, on = true) => {
      byI.get(i)?.classList.toggle(cls, on);
      labI.get(i)?.classList.toggle(cls, on);
    };
    const adj = new Map<number, [number, SVGLineElement][]>();
    for (const l of lines) {
      const a = +l.dataset.a!;
      const b = +l.dataset.b!;
      (adj.get(a) || adj.set(a, []).get(a)!).push([b, l]);
      (adj.get(b) || adj.set(b, []).get(b)!).push([a, l]);
    }
    const W = +svg.dataset.w!;
    const H = +svg.dataset.h!;

    /* ---- View: translate + scale in viewBox units ---- */
    // --k is screen pixels per map unit (fit × zoom), so text and strokes stay a constant pixel size,
    // and a label shows once the scale reaches the level the build found it fits at (data-l).
    let k = 1;
    let tx = 0;
    let ty = 0;
    let lastEff = 0;
    const levels = nodes.map((n) => +n.dataset.l!);
    const apply = () => {
      vp.setAttribute(
        'transform',
        `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(3)})`,
      );
      const fit = svg.getScreenCTM()?.a || 0;
      if (!fit) return;
      const eff = k * fit;
      svg.style.setProperty('--k', eff.toFixed(3));
      if (Math.abs(eff - lastEff) < 1e-3) return;
      lastEff = eff;
      nodes.forEach((n, j) => {
        labI.get(+n.dataset.i!)?.classList.toggle('lab', levels[j] <= eff * 1.001);
      });
      // Region headings are a fixed pixel size, so on a narrow screen pull them in from the map's edges.
      for (const r of regions) {
        r.dataset.x ??= r.getAttribute('x') ?? '0';
        let w = 0;
        try {
          w = r.getBBox().width;
        } catch {
          // not laid out (hidden): no box, so no inset
        }
        const m = w / 2 + 6 / eff;
        r.setAttribute('x', String(Math.max(m, Math.min(W - m, +r.dataset.x!))));
      }
    };
    const ro = new ResizeObserver(apply);
    ro.observe(svg);
    off.push(() => ro.disconnect());
    const toSvg = (cx: number, cy: number) => {
      const m = svg.getScreenCTM();
      if (!m) return { x: W / 2, y: H / 2 };
      const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    };
    const zoomAt = (p: { x: number; y: number }, f: number) => {
      const k2 = Math.min(8, Math.max(0.6, k * f));
      tx = p.x - (p.x - tx) * (k2 / k);
      ty = p.y - (p.y - ty) * (k2 / k);
      k = k2;
      apply();
    };
    svg.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        zoomAt(toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)));
      },
      { passive: false },
    );

    // Pointers: one drags, two pinch. A press that moves more than a few pixels is not a tap.
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch: { d: number; k: number } | null = null;
    svg.addEventListener('pointerdown', (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) moved = 0;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k };
      }
    });
    svg.addEventListener('pointermove', (e: PointerEvent) => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      ptrs.set(e.pointerId, cur);
      if (ptrs.size === 1) {
        moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        if (moved > 6) {
          if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);
          svg.classList.add('drag');
          const p0 = toSvg(prev.x, prev.y);
          const p1 = toSvg(cur.x, cur.y);
          tx += p1.x - p0.x;
          ty += p1.y - p0.y;
          apply();
        }
      } else if (ptrs.size === 2 && pinch) {
        moved = 99;
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(toSvg((a.x + b.x) / 2, (a.y + b.y) / 2), (pinch.k * d) / pinch.d / k);
      }
    });
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!ptrs.size) svg.classList.remove('drag');
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);

    /* ---- Focus: a note and its neighbours ---- */
    let sel = -1;
    const esc = (s: unknown) =>
      String(s).replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
      );
    const clear = () => {
      sel = -1;
      svg.classList.remove('focus');
      for (const x of box.querySelectorAll('.near, .sel')) x.classList.remove('near', 'sel');
      card.hidden = true;
    };
    const select = (i: number) => {
      clear();
      sel = i;
      const n = byI.get(i)!;
      const d = data[i] ?? ({} as Partial<MapCard>);
      svg.classList.add('focus');
      mark(i, 'near');
      mark(i, 'sel');
      const nb = adj.get(i) || [];
      for (const [j, l] of nb) {
        mark(j, 'near');
        l.classList.add('near');
      }
      const list = nb.map(([j]) => j).sort((a, b) => (data[b]?.d || 0) - (data[a]?.d || 0));
      const meta = [
        areaOf.get(d.a ?? '')?.label,
        d.y,
        `${nb.length} connection${nb.length === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · ');
      // Tailwind finds these classes in this file, so they stay literal.
      card.innerHTML =
        `<div class="flex items-start gap-3"><div class="min-w-0 flex-1">` +
        `<div class="flex items-center gap-2 text-base font-semibold leading-snug a-${esc(d.a || 'none')}">` +
        `<i class="size-2.5 shrink-0 rounded-full bg-(--c)"></i>${esc(d.t)}</div>` +
        `<div class="mt-0.5 text-xs text-faint">${esc(meta)}</div></div>` +
        `<button type="button" class="x -mt-1.5 -mr-1.5 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-faint hover:bg-accent hover:text-foreground" aria-label="Close">` +
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>` +
        (d.s ? `<p class="mt-2 mb-0 text-muted-foreground">${esc(d.s)}</p>` : '') +
        `<a class="mt-2 inline-block font-medium text-primary no-underline hover:underline" href="${esc(n.getAttribute('href'))}">Open note →</a>` +
        (list.length
          ? `<p class="mt-3 mb-0 border-t pt-2.5 text-xs leading-relaxed text-faint">Connected: ${list
              .slice(0, 14)
              .map(
                (j) =>
                  `<a class="text-muted-foreground no-underline hover:text-primary hover:underline" href="${esc(byI.get(j)!.getAttribute('href'))}" data-pick="${j}">${esc(data[j]?.t || '')}</a>`,
              )
              .join(', ')}${list.length > 14 ? `, +${list.length - 14} more` : ''}</p>`
          : '');
      card.hidden = false;
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick) {
        e.preventDefault();
        select(+pick.dataset.pick!);
        return;
      }
      if (t.closest('.vm-card .x')) {
        clear();
        return;
      }
      if (!t.closest('.vm-svg')) return;
      const a = t.closest<SVGAElement>('.vm-n');
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
        return;
      }
      if (!a) {
        clear();
        return;
      }
      const i = +a.dataset.i!;
      // First tap focuses; a second tap on the same note opens it.
      if (i !== sel) {
        e.preventDefault();
        e.stopPropagation();
        select(i);
      }
    };
    box.addEventListener('click', onClick, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sel >= 0) clear();
    };
    document.addEventListener('keydown', onKey);
    off.push(() => document.removeEventListener('keydown', onKey));
    // Hover (or keyboard focus) shows a dot's label even when it is not placed at this zoom.
    const hov = (e: Event, on: boolean) => {
      const a = (e.target as Element).closest?.<SVGAElement>('.vm-n');
      if (a) mark(+a.dataset.i!, 'hov', on);
    };
    svg.addEventListener('pointerover', (e) => hov(e, true));
    svg.addEventListener('pointerout', (e) => hov(e, false));
    svg.addEventListener('focusin', (e) => hov(e, true));
    svg.addEventListener('focusout', (e) => hov(e, false));

    /* ---- Controls ---- */
    const hidden = new Set<string>();
    const filter = () => {
      for (const n of nodes) mark(+n.dataset.i!, 'off', hidden.has(n.dataset.area!));
      for (const l of lines)
        l.classList.toggle(
          'off',
          byI.get(+l.dataset.a!)!.classList.contains('off') ||
            byI.get(+l.dataset.b!)!.classList.contains('off'),
        );
      for (const r of regions)
        r.classList.toggle(
          'off',
          [...hidden].some((a) => r.classList.contains(`a-${a}`)),
        );
      if (sel >= 0 && byI.get(sel)!.classList.contains('off')) clear();
    };
    for (const c of box.querySelectorAll<HTMLElement>('.vm-chip'))
      c.addEventListener('click', () => {
        const on = c.getAttribute('aria-pressed') !== 'false';
        c.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (on) hidden.add(c.dataset.area!);
        else hidden.delete(c.dataset.area!);
        filter();
      });
    const relBtn = box.querySelector('[data-edges]')!;
    relBtn.addEventListener('click', () => {
      const on = relBtn.getAttribute('aria-pressed') !== 'true';
      relBtn.setAttribute('aria-pressed', String(on));
      svg.classList.toggle('relonly', on);
    });
    for (const b of box.querySelectorAll<HTMLElement>('[data-zoom]'))
      b.addEventListener('click', () => {
        const z = +b.dataset.zoom!;
        if (!z) {
          k = 1;
          tx = 0;
          ty = 0;
          apply();
          clear();
          return;
        }
        zoomAt({ x: W / 2, y: H / 2 }, z > 0 ? 1.5 : 1 / 1.5);
      });
    apply();
    return () => {
      for (const f of off) f();
    };
  }
}
