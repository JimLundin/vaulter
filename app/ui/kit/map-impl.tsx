// The map itself, loaded on first use (map.tsx).
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// The renderer's worker, bundled on its own: MapLibre finds it next to itself otherwise, which a
// bundle doesn't keep.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'react';
import { cn } from './lib/utils.ts';
import type { MapPoint, MapRoute, MapViewProps } from './map.tsx';
import { useDark } from './theme.tsx';

setWorkerUrl(workerUrl);

const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

const tone = {
  neutral: 'bg-primary text-primary-foreground',
  people: 'bg-people text-white',
  places: 'bg-places text-white',
  events: 'bg-events text-white',
};

/** A theme colour as the map needs it: resolved, not a light-dark() expression. */
function color(token: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(--${token})`;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

const ROUTES = 'vaulter-routes';

/** Draws the routes into the map's style (again after a new style, which drops them). */
function drawRoutes(m: MapLibre, routes: MapRoute[]) {
  const data = {
    type: 'FeatureCollection' as const,
    features: routes.map((r) => ({
      type: 'Feature' as const,
      properties: { dashed: !!r.dashed },
      geometry: { type: 'LineString' as const, coordinates: r.points.map((p) => [p.lon, p.lat]) },
    })),
  };
  const source = m.getSource(ROUTES) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data).catch(() => undefined);
    return;
  }
  m.addSource(ROUTES, { type: 'geojson', data });
  const paint = { 'line-color': color('link'), 'line-width': 3 };
  const layout = { 'line-cap': 'round' as const, 'line-join': 'round' as const };
  m.addLayer({
    id: `${ROUTES}-solid`,
    type: 'line',
    source: ROUTES,
    filter: ['==', ['get', 'dashed'], false],
    paint,
    layout,
  });
  m.addLayer({
    id: `${ROUTES}-dashed`,
    type: 'line',
    source: ROUTES,
    filter: ['==', ['get', 'dashed'], true],
    paint: { ...paint, 'line-dasharray': [1.5, 1.5] },
    layout: { 'line-join': 'round' },
  });
}

/** The places as the kit's own elements, so they follow the theme; returns how to take them off. */
function addMarkers(
  m: MapLibre,
  points: MapPoint[],
  selected: string | undefined,
  onSelect: (id: string) => void,
) {
  const markers = points.map((p) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.title = p.label;
    el.setAttribute('aria-label', p.label);
    el.className = cn(
      'flex cursor-pointer items-center justify-center rounded-full border-0 font-sans font-semibold shadow-md ring-2 ring-background',
      p.n === undefined ? 'size-3.5' : 'size-7 text-xs',
      tone[p.tone ?? 'neutral'],
      selected === p.id && 'ring-4 ring-ring',
    );
    if (p.n !== undefined) el.textContent = String(p.n);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(p.id);
    });
    return new Marker({ element: el }).setLngLat([p.at.lon, p.at.lat]).addTo(m);
  });
  return () => {
    for (const mk of markers) mk.remove();
  };
}

/** The view: everything shown, with room around it. */
function frameAll(m: MapLibre, points: MapPoint[], routes: MapRoute[]) {
  const all = [...points.map((p) => p.at), ...routes.flatMap((r) => r.points)];
  const [one] = all;
  if (!one) return;
  if (all.length === 1) {
    m.jumpTo({ center: [one.lon, one.lat], zoom: 14 });
    return;
  }
  const bounds = new LngLatBounds();
  for (const p of all) bounds.extend([p.lon, p.lat]);
  m.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
}

export function MapImpl({ points = [], routes = [], selected, onSelect }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | undefined>(undefined);
  const dark = useDark();
  // Points and routes are plain data: by value, so a new array of the same ones changes nothing.
  const routesKey = JSON.stringify(routes);
  const pointsKey = JSON.stringify(points);
  const ready = useRef(false);
  // What the map's own callbacks reach for: the latest routes and handler.
  const latest = useRef({ routes, onSelect, dark });
  latest.current = { routes, onSelect, dark };

  useEffect(() => {
    if (!host.current) return;
    const m = new MapLibre({
      container: host.current,
      style: STYLE[latest.current.dark ? 'dark' : 'light'],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('style.load', () => {
      ready.current = true;
      drawRoutes(m, latest.current.routes);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    ready.current = false;
    map.current.setStyle(STYLE[dark ? 'dark' : 'light']);
  }, [dark]);

  // Before the style has loaded there is nowhere to draw; style.load draws then.
  useEffect(() => {
    if (map.current && ready.current) drawRoutes(map.current, JSON.parse(routesKey));
  }, [routesKey]);

  useEffect(() => {
    if (!map.current) return;
    return addMarkers(map.current, JSON.parse(pointsKey), selected, (id) =>
      latest.current.onSelect?.(id),
    );
  }, [pointsKey, selected]);

  useEffect(() => {
    if (map.current) frameAll(map.current, JSON.parse(pointsKey), JSON.parse(routesKey));
  }, [pointsKey, routesKey]);

  // Sized, not positioned: MapLibre makes its container position: relative.
  return <div ref={host} className="size-full" />;
}
