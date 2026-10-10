// A map: places as markers (numbered, in their kind's colour), routes between them, the view fitted to
// what is shown. MapLibre and its tiles load only when a map first shows, so the bundle stays small.
// Tiles come from OpenFreeMap (no key); the area in view is what it sees of you.
import { type ComponentType, useEffect, useState } from 'react';
import type { Tone } from './app.tsx';
import { cn } from './lib/utils.ts';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface MapPoint {
  id: string;
  at: LatLon;
  /** Read out, and shown on hover. */
  label: string;
  /** A number in the marker: the order of the day's places. */
  n?: number;
  tone?: Tone;
}

export interface MapRoute {
  id: string;
  points: LatLon[];
  /** Dashed for one way of travelling (a run), solid for another (walking). */
  dashed?: boolean;
}

export interface MapViewProps {
  points?: MapPoint[];
  routes?: MapRoute[];
  selected?: string;
  onSelect?: (id: string) => void;
  /** What it shows, for screen readers: "Today's places". */
  label: string;
  /** A panel's strip, a section, or all the space it is given. */
  size?: 'sm' | 'md' | 'fill';
}

/** MapLibre, once a map first shows: until then the map's ground. */
function useImpl() {
  const [impl, setImpl] = useState<{ C: ComponentType<MapViewProps> } | undefined>(undefined);
  useEffect(() => {
    let live = true;
    import('./map-impl.tsx').then(
      (m) => live && setImpl({ C: m.MapImpl }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return impl?.C;
}

export function MapView({ size = 'md', ...props }: MapViewProps) {
  const Impl = useImpl();
  return (
    <section
      aria-label={props.label}
      className={cn(
        'relative w-full overflow-hidden bg-muted',
        size === 'sm' && 'h-[132px]',
        size === 'md' && 'h-64 rounded-xl border',
        size === 'fill' && 'h-full min-h-64',
      )}
    >
      {Impl ? <Impl {...props} /> : null}
    </section>
  );
}
