// The Places page's interactive map (app/views/Places.tsx): every place note on a street map, sized by
// how often Jim was there, with its events, and his day-by-day trail. Tiles come from OpenStreetMap's tile
// server, so this page fetches map images as it is panned; nothing else in the vault does. The server needs
// a Referer (GitHub Pages sends one; a page opened from a local file gets blocked tiles). Dark mode inverts
// the tiles in CSS, since OSM has no dark style. Leaflet is passed in, so it loads with the view.
import type * as Leaflet from 'leaflet';

export interface PlaceEvent {
  d: string;
  w: string;
  n: string;
  h: string;
}
/** One place note with geo: t title, h href, s summary, a address; days/last from daily notes' `where`. */
export interface Place {
  id: string;
  t: string;
  h: string;
  s: string;
  a: string;
  lat: number;
  lon: number;
  area: string;
  parent: string;
  days: number;
  last: string;
  ev: PlaceEvent[];
}
/** trail: each day with a known whereabouts, in order, and the places that day. */
export interface PlacesData {
  places: Place[];
  trail: [string, string[]][];
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fmt = (d: string) =>
  d.length === 10
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : d;

const tiles = (L: typeof Leaflet) =>
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      // biome-ignore lint/security/noSecrets: OpenStreetMap's required attribution HTML, not a credential
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });

/**
 * The map in `el` (a .pl-canvas inside it, optionally a .pl-trail checkbox; anything with data-fly
 * flies to that place). `link` turns a site href into one that works where the map is shown.
 */
/** A colour token as Leaflet needs it: resolved for the current theme (the tokens are light-dark() pairs). */
function resolved(token: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(${token}, #888)`;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

export function mountPlaces(
  el: HTMLElement,
  L: typeof Leaflet,
  data: PlacesData,
  link: (h: string) => string = (h) => h,
) {
  const box = el.querySelector<HTMLElement>('.pl-canvas')!;
  const map = L.map(box, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: true });
  tiles(L).addTo(map);
  const colour = (area: string) => resolved(`--a-${area || 'none'}`);
  const byId = new Map(data.places.map((p) => [p.id, p]));

  const markers = new Map<string, Leaflet.CircleMarker>();
  for (const p of data.places) {
    const weight = p.days + p.ev.length;
    const m = L.circleMarker([p.lat, p.lon], {
      radius: Math.min(16, 6 + Math.sqrt(weight) * 2.2),
      color: colour(p.area),
      weight: 2,
      fillColor: colour(p.area),
      fillOpacity: weight ? 0.55 : 0.25,
    }).addTo(map);
    const ev = p.ev
      .slice(0, 8)
      .map(
        (e) =>
          `<li><span>${esc(fmt(e.d))}</span> ${esc(e.w)} · <a href="${esc(link(e.h))}">${esc(e.n)}</a></li>`,
      )
      .join('');
    m.bindPopup(
      `<div class="pl-pop"><a class="pl-t" href="${esc(link(p.h))}">${esc(p.t)}</a>` +
        (p.s ? `<p>${esc(p.s)}</p>` : '') +
        (p.a ? `<p class="pl-a">${esc(p.a)}</p>` : '') +
        (p.days
          ? `<p class="pl-n">${p.days} ${p.days === 1 ? 'day' : 'days'} here · last ${esc(fmt(p.last))}</p>`
          : '') +
        (ev ? `<ul>${ev}</ul>` : '') +
        '</div>',
      { maxWidth: 300 },
    );
    m.bindTooltip(esc(p.t), { direction: 'top', offset: [0, -6] });
    markers.set(p.id, m);
  }

  // The trail: consecutive places in the order Jim was at them, day by day.
  const seq: Place[] = [];
  for (const [, ids] of data.trail)
    for (const id of ids) {
      const p = byId.get(id);
      if (p && seq.at(-1) !== p) seq.push(p);
    }
  const trail = L.polyline(
    seq.map((p): [number, number] => [p.lat, p.lon]),
    {
      color: resolved('--faint'),
      weight: 1.5,
      opacity: 0.6,
      dashArray: '4 6',
    },
  );
  const toggle = el.querySelector<HTMLInputElement>('.pl-trail');
  if (toggle) {
    const label = toggle.closest('label');
    if (label && seq.length < 2) label.hidden = true;
    const apply = () => (toggle.checked ? trail.addTo(map) : trail.remove());
    toggle.addEventListener('change', apply);
    apply();
  }

  // Start on the places that matter most: where Jim has been and what happened, leaving out the far-off
  // (a country on another continent would zoom the map out to the whole world).
  const pts = data.places.filter((p) => p.days || p.ev.length);
  const base = pts.length ? pts : data.places;
  const [mid] = [...base].sort((a, b) => b.days - a.days);
  const km = (a: Place, b: Place) =>
    Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));
  const near = mid ? base.filter((p) => km(p, mid) < 1500) : [];
  if (near.length > 1)
    map.fitBounds(
      near.map((p) => [p.lat, p.lon]),
      { padding: [30, 30], maxZoom: 13 },
    );
  else if (near.length) map.setView([near[0].lat, near[0].lon], 13);
  else map.setView([59.3, 18], 5);

  // Jump buttons and list entries fly to a place (and everything located in it).
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-fly]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.fly!;
    const group = data.places.filter((p) => p.id === id || p.parent === id);
    if (group.length > 1)
      map.flyToBounds(
        group.map((p) => [p.lat, p.lon]),
        { padding: [40, 40], maxZoom: 15 },
      );
    else if (group.length) map.flyTo([group[0].lat, group[0].lon], 15);
    markers.get(id)?.openPopup();
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  return map;
}
