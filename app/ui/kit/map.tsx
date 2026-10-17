import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';

export interface MapMarker {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

/** Geographic presentation only: supplied positions and explicit selection. */
export function MapView({
  markers,
  selected,
  onSelect,
}: {
  markers: readonly MapMarker[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef(new Map<string, Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [ready, setReady] = useState(false);
  const library = useRef<typeof import('leaflet') | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    let active = true;
    let cleanup: () => void = () => undefined;
    import('leaflet')
      .then((L) => {
        if (!(active && container.current)) return;
        library.current = L;
        const view = L.map(container.current, { attributionControl: true }).setView([25, 10], 2);
        map.current = view;
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(view);
        let failed = false;
        tiles.on('loading', () => {
          failed = false;
        });
        tiles.on('tileerror', () => {
          failed = true;
          setTileError(true);
        });
        tiles.on('load', () => setTileError(failed));
        const observer = new ResizeObserver(() => view.invalidateSize());
        observer.observe(container.current);
        cleanup = () => {
          observer.disconnect();
          view.remove();
          map.current = null;
        };
        setReady(true);
      })
      .catch(() => {
        if (active) setTileError(true);
      });
    return () => {
      active = false;
      cleanup();
    };
  }, []);
  useEffect(() => {
    const view = map.current;
    const L = library.current;
    if (!(ready && view && L)) return;
    for (const marker of layers.current.values()) marker.remove();
    layers.current.clear();
    for (const position of markers) {
      const marker = L.marker([position.latitude, position.longitude], {
        icon: L.divIcon({
          className: 'kit-map-pin',
          html: '<span></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: position.label,
        alt: position.label,
        keyboard: true,
      })
        .addTo(view)
        .on('click', () => select.current(position.id));
      const tooltip = document.createElement('span');
      tooltip.textContent = position.label;
      marker.bindTooltip(tooltip);
      layers.current.set(position.id, marker);
    }
    if (markers.length)
      view.fitBounds(L.latLngBounds(markers.map((marker) => [marker.latitude, marker.longitude])), {
        padding: [48, 48],
        maxZoom: 13,
      });
  }, [markers, ready]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Marker replacement and library readiness must reapply selection.
  useEffect(() => {
    for (const [id, marker] of layers.current)
      marker.getElement()?.classList.toggle('kit-map-pin-selected', id === selected);
    const marker = selected ? layers.current.get(selected) : undefined;
    if (marker && map.current) map.current.panTo(marker.getLatLng());
  }, [selected, markers, ready]);
  return (
    <div className="kit-map-frame">
      <section ref={container} aria-label="Geographic map" className="kit-map-canvas" />
      {!!tileError && (
        <p role="status" className="kit-map-status">
          Map tiles are unavailable. Your coordinates are still available in the list.
        </p>
      )}
    </div>
  );
}
