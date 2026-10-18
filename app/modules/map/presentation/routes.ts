import { definePage } from '@/core/navigation/index.ts';
import { MapPage } from './MapPage.tsx';
import { mapRoute } from '@/modules/map/routes.ts';
export const mapPage = definePage({
  patterns: [mapRoute],
  component: MapPage,
  destination: { label: 'Map', href: mapRoute.href(), icon: 'map' },
  command: { id: 'go.map', keys: 'g m' },
});
