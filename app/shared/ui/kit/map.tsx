import { type ComponentType, useEffect, useState } from 'react';

export interface MapMarker {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}
export interface MapViewProps {
  markers: readonly MapMarker[];
  selected?: string;
  onSelect: (id: string) => void;
}

/** Load the geographic renderer when a map mounts, keeping data callers browser-independent. */
export function MapView(props: MapViewProps) {
  const [implementation, setImplementation] = useState<
    { View: ComponentType<MapViewProps> } | undefined
  >(undefined);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    import('./map-impl.tsx').then(
      (module) => {
        if (active) setImplementation({ View: module.MapImpl });
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const View = implementation?.View;
  return (
    <section aria-label="Geographic map" className="kit-map-frame">
      {!!View && <View {...props} />}
      {!!error && (
        <p role="status" className="kit-map-status">
          The map is unavailable. Your coordinates are still available in the list.
        </p>
      )}
    </section>
  );
}
