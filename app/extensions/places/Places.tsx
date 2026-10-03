// Where things happen (conventions §3, "Places"): every place note with `geo` on a street map, how many
// days Jim was there (daily notes' `where`), what happened there (`dates` entries' `where`), his trail,
// and the same as a list grouped by place. Leaflet loads with this view; tiles come from OpenStreetMap.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { Vault } from '../../../core/derive.ts';
import { titleOf, excerptOf, hrefOf, kind, facet, asList } from '../../../core/note-fields.ts';
import { datesOf } from '../../../core/facts.ts';
import { fmtDay } from '../../../core/format.ts';
import type { Place, PlaceEvent, PlacesData } from './places-view.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './places.css';
import { later } from '../../core/later.ts';

function placesData(v: Vault): PlacesData {
  // Days: each daily note's `where`, in order. Events: `dates` entries with a `where`.
  const trail = v.notes
    .filter((n) => kind(n.id) === 'daily' && asList(n.data.where).length)
    .map((n) => [n.id.slice(6), asList(n.data.where)] as [string, string[]]);
  const days = new Map<string, string[]>();
  for (const [d, ids] of trail)
    for (const id of new Set(ids)) days.set(id, [...(days.get(id) ?? []), d]);
  const events = new Map<string, PlaceEvent[]>();
  for (const d of v.notes.flatMap(datesOf))
    if (d.where)
      events.set(d.where, [
        ...(events.get(d.where) ?? []),
        { d: d.date, w: d.what, n: titleOf(d.note), h: hrefOf(d.note) },
      ]);
  const places = v.notes
    .filter((n) => kind(n.id) === 'note' && n.data.type === 'place' && n.data.geo)
    .map((n): Place => {
      const d = n.data;
      const ds = days.get(n.id) ?? [];
      return {
        id: n.id,
        t: titleOf(n),
        h: hrefOf(n),
        s: excerptOf(n, 160),
        a: d.address ?? '',
        lat: d.geo.lat,
        lon: d.geo.lon,
        area: facet(n, 'area'),
        parent: asList(d.relations?.['located-in'])[0] ?? '',
        days: ds.length,
        last: ds.at(-1) ?? '',
        ev: (events.get(n.id) ?? []).sort((a, b) => b.d.localeCompare(a.d)),
      };
    });
  return { places, trail };
}

const weight = (p: Place) => p.days + p.ev.length;
const daysLabel = (p: Place) =>
  p.days ? `${p.days} ${p.days === 1 ? 'day' : 'days'}, last ${fmtDay(p.last)}` : '';

export function Places() {
  const v = useVault();
  const data = useMemo(() => placesData(v), [v]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: { remove: () => void } | undefined;
    let live = true;
    later(
      Promise.all([
        import('leaflet'),
        import('./places-view.ts'),
        import('leaflet/dist/leaflet.css'),
      ]).then(([L, { mountPlaces }]) => {
        if (live && box.current) map = mountPlaces(box.current, L.default ?? L, data, link);
      }),
    );
    return () => {
      live = false;
      map?.remove();
    };
  }, [data]);

  // Top-level places (no parent among the place notes) with what is located in them, busiest first.
  const ids = new Set(data.places.map((p) => p.id));
  const top = data.places
    .filter((p) => !ids.has(p.parent))
    .map((p) => ({
      p,
      kids: data.places
        .filter((k) => k.parent === p.id)
        .sort((a, b) => weight(b) - weight(a) || a.t.localeCompare(b.t)),
    }))
    .sort(
      (a, b) =>
        weight(b.p) +
          b.kids.reduce((s, k) => s + weight(k), 0) -
          (weight(a.p) + a.kids.reduce((s, k) => s + weight(k), 0)) || a.p.t.localeCompare(b.p.t),
    );
  const recent = [...data.trail].reverse().slice(0, 21);
  const title = (id: string) => {
    const n = v.byId.get(id);
    return n ? titleOf(n) : id;
  };
  const href = (id: string) => {
    const n = v.byId.get(id);
    return n ? link(hrefOf(n)) : '#';
  };
  const events = (ev: PlaceEvent[]) =>
    ev.length > 0 && (
      <ul className="pl-ev">
        {ev.map((e) => (
          <li key={`${e.d}|${e.h}|${e.w}`}>
            <time>{fmtDay(e.d)}</time>
            {e.w} · <a href={link(e.h)}>{e.n}</a>
          </li>
        ))}
      </ul>
    );
  const sub = (p: Place) => [p.a, daysLabel(p)].filter(Boolean).join(' · ');

  return (
    <div className="v-places">
      <div className="meta">
        <span className="chip">places</span>
      </div>
      <h1>Places</h1>
      <p className="lede">
        {data.places.length} places, {data.trail.length} days with a known whereabouts. Dots are
        sized by days spent and events there; tap one for what happened. Record places with{' '}
        <code>geo</code> on a place note and <code>where</code> on days and dates.
      </p>

      <div className="pl-map" ref={box}>
        <div className="pl-bar">
          <span className="pl-jump">
            {top.map(({ p }) => (
              <button key={p.id} type="button" data-fly={p.id}>
                {p.t}
              </button>
            ))}
          </span>
          <label>
            <input type="checkbox" className="pl-trail" defaultChecked={true} /> Trail
          </label>
        </div>
        <div className="pl-canvas" />
        <p className="pl-note">Map images are loaded from OpenStreetMap as you pan.</p>
      </div>

      <section className="pl-list">
        {top.map(({ p, kids }) => (
          <div key={p.id} className="pl-group">
            <h2>
              <a href={link(p.h)}>{p.t}</a>{' '}
              <button type="button" className="pl-fly" data-fly={p.id}>
                show on map
              </button>
            </h2>
            {!!sub(p) && <p className="pl-sub">{sub(p)}</p>}
            {events(p.ev)}
            {kids.length > 0 && (
              <ul className="pl-kids">
                {kids.map((k) => (
                  <li key={k.id}>
                    <a href={link(k.h)}>{k.t}</a>{' '}
                    <button type="button" className="pl-fly" data-fly={k.id}>
                      map
                    </button>
                    {!!sub(k) && <span className="pl-sub">{sub(k)}</span>}
                    {events(k.ev)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section className="pl-days">
          <h2>Recent days</h2>
          <ul>
            {recent.map(([d, ps]) => (
              <li key={d}>
                <a className="d" href={link(`/daily/${d}/`)}>
                  {fmtDay(d)}
                </a>
                <span>
                  {ps.map((id, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a day's trail is ordered and may revisit a place; position is the identity
                    <Fragment key={i}>
                      {i > 0 && ' → '}
                      <a href={href(id)}>{title(id)}</a>
                    </Fragment>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
