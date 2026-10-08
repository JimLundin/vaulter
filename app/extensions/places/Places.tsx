// Where things happen (conventions §3, "Places"): every place note with `geo` on a street map, how many
// days Jim was there (daily notes' `where`), what happened there (`dates` entries' `where`), his trail,
// and the same as a list grouped by place. Leaflet loads with this view; tiles come from OpenStreetMap.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { MapPinIcon } from 'lucide-react';
import type { Graph } from '../graph/model/graph.ts';
import { titleOf, excerptOf, hrefOf, kind, facet, asList } from '../notes/model/fields.ts';
import { datesOf } from '../notes/model/facts.ts';
import { fmtDay } from '../../core/format.ts';
import type { Place, PlaceEvent, PlacesData } from './places-view.ts';
import { link } from '../../core/route.ts';
import { later } from '../../core/later.ts';
import { Field, FieldList, PageHeader, Section } from '@/components/layout.tsx';
import { Button } from '@/components/ui/button.tsx';
import './places.css';
import { useGraph } from '../graph/use.ts';

function placesData(v: Graph): PlacesData {
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
const linkCls = 'text-primary no-underline hover:underline';

export function Places() {
  const v = useGraph();
  const data = useMemo(() => placesData(v), [v]);
  // The whole page, so the list's map buttons fly too (places-view.ts listens for data-fly in it).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: { remove: () => void } | undefined;
    let live = true;
    later(
      Promise.all([import('leaflet'), import('./places-view.ts'), import('./leaflet.css')]).then(
        ([L, { mountPlaces }]) => {
          if (live && box.current) map = mountPlaces(box.current, L.default ?? L, data, link);
        },
      ),
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
      <FieldList className="mt-2 text-sm">
        {ev.map((e) => (
          <Field key={`${e.d}|${e.h}|${e.w}`} date={true} label={fmtDay(e.d)}>
            {e.w} ·{' '}
            <a className={linkCls} href={link(e.h)}>
              {e.n}
            </a>
          </Field>
        ))}
      </FieldList>
    );
  const sub = (p: Place) => [p.a, daysLabel(p)].filter(Boolean).join(' · ');
  const fly = (p: Place, label: string) => (
    <Button variant="ghost" size="xs" className="text-muted-foreground" data-fly={p.id}>
      <MapPinIcon />
      {label}
    </Button>
  );

  return (
    <div className="v-places" ref={box}>
      <PageHeader
        kind="places"
        title="Places"
        lede={
          <p>
            {data.places.length} places, {data.trail.length} days with a known whereabouts. Dots are
            sized by days spent and events there; tap one for what happened. Record places with{' '}
            <code>geo</code> on a place note and <code>where</code> on days and dates.
          </p>
        }
      />

      <div className="mt-4 mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {top.map(({ p }) => (
              <Button key={p.id} variant="outline" size="sm" data-fly={p.id}>
                {p.t}
              </Button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="pl-trail size-4 cursor-pointer accent-primary"
              defaultChecked={true}
            />
            Trail
          </label>
        </div>
        <div className="pl-canvas z-0 h-[min(70vh,34rem)] rounded-xl border" />
        <p className="m-0 mt-2 text-xs text-faint">
          Map images are loaded from OpenStreetMap as you pan.
        </p>
      </div>

      {top.map(({ p, kids }) => (
        <Section
          key={p.id}
          title={
            <a className="text-foreground no-underline hover:text-primary" href={link(p.h)}>
              {p.t}
            </a>
          }
          count={kids.length || undefined}
          action={fly(p, 'Show on map')}
        >
          {!!sub(p) && <p className="m-0 text-sm text-faint">{sub(p)}</p>}
          {events(p.ev)}
          {kids.length > 0 && (
            <ul className="m-0 mt-3 list-none space-y-4 border-l-2 p-0 pl-4">
              {kids.map((k) => (
                <li key={k.id}>
                  <div className="flex flex-wrap items-center gap-x-2">
                    <a
                      className="font-semibold text-primary no-underline hover:underline"
                      href={link(k.h)}
                    >
                      {k.t}
                    </a>
                    {fly(k, 'Map')}
                  </div>
                  {!!sub(k) && <p className="m-0 text-sm text-faint">{sub(k)}</p>}
                  {events(k.ev)}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}

      {recent.length > 0 && (
        <Section title="Recent days">
          <FieldList>
            {recent.map(([d, ps]) => (
              <Field
                key={d}
                date={true}
                label={
                  <a
                    className="text-inherit no-underline hover:underline"
                    href={link(`/daily/${d}/`)}
                  >
                    {fmtDay(d)}
                  </a>
                }
              >
                {ps.map((id, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a day's trail is ordered and may revisit a place; position is the identity
                  <Fragment key={i}>
                    {i > 0 && <span className="text-faint"> → </span>}
                    <a className={linkCls} href={href(id)}>
                      {title(id)}
                    </a>
                  </Fragment>
                ))}
              </Field>
            ))}
          </FieldList>
        </Section>
      )}
    </div>
  );
}
