// Restore the MapLibre/OpenFreeMap presentation retained before c88b4f5.
import {
  LngLatBounds,
  Map as MapLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { useDark } from './theme.tsx';
import type { MapViewProps } from './map.tsx';

setWorkerUrl(workerUrl);
const styles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Camera and markers survive appearance changes; only the base-map style changes. */
export function MapImpl({ markers, selected, onSelect }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | undefined>(undefined);
  const rendered = useRef(new Map<string, Marker>());
  const dark = useDark();
  const latest = useRef({ dark, onSelect });
  latest.current = { dark, onSelect };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const positions = JSON.stringify(markers);
  useEffect(() => {
    if (!host.current) return;
    const view = new MapLibre({
      container: host.current,
      style: styles[latest.current.dark ? 'dark' : 'light'],
      center: [10, 25],
      zoom: 2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    view.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    view.on('error', () => setError(true));
    view.on('style.load', () => setError(false));
    map.current = view;
    const resize = new ResizeObserver(() => view.resize());
    resize.observe(host.current);
    setReady(true);
    return () => {
      resize.disconnect();
      view.remove();
      rendered.current.clear();
      map.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (ready && map.current) {
      setError(false);
      map.current.setStyle(styles[dark ? 'dark' : 'light']);
    }
  }, [dark, ready]);
  useEffect(() => {
    const view = map.current;
    if (!(ready && view)) return;
    const points: MapViewProps['markers'] = JSON.parse(positions);
    for (const marker of rendered.current.values()) marker.remove();
    rendered.current.clear();
    for (const point of points) {
      const element = document.createElement('button');
      element.type = 'button';
      element.title = point.label;
      element.setAttribute('aria-label', point.label);
      element.className = 'kit-map-marker';
      const mark = document.createElement('span');
      element.append(mark);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        latest.current.onSelect(point.id);
      });
      const marker = new Marker({ element })
        .setLngLat([point.longitude, point.latitude])
        .addTo(view);
      rendered.current.set(point.id, marker);
    }
    if (points.length === 1)
      view.jumpTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 14 });
    else if (points.length > 1) {
      const bounds = new LngLatBounds();
      for (const point of points) bounds.extend([point.longitude, point.latitude]);
      view.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    }
  }, [positions, ready]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Replacement markers must regain their selected state.
  useEffect(() => {
    for (const [id, marker] of rendered.current) {
      const element = marker.getElement();
      element.classList.toggle('kit-map-marker-selected', id === selected);
      element.setAttribute('aria-pressed', String(id === selected));
    }
  }, [selected, positions, ready]);
  return (
    <>
      <div ref={host} className="kit-map-canvas" data-map-theme={dark ? 'dark' : 'light'} />
      {!!error && (
        <p role="status" className="kit-map-status">
          Map tiles are unavailable. Your coordinates are still available in the list.
        </p>
      )}
    </>
  );
}
