// The map: every topical note as a dot, by area, with links and relations as edges (#/map/); under each
// note, its neighbourhood. The layout is computed once per graph (layout.ts, vault-map.ts).
import { WaypointsIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { MapView } from './MapView.tsx';
import { LocalMap } from './LocalMap.tsx';
import { noteSections } from '../reader/slots.tsx';
import { mapPage } from './routes.ts';

export const map: Extension = {
  id: 'map',
  page: (path) => (mapPage.match(path) ? { title: 'Map', body: <MapView />, width: 'wide' } : null),
  nav: [
    {
      label: 'Map',
      href: mapPage.href(),
      icon: WaypointsIcon,
      keys: 'g m',
      order: 20,
      summary: 'Every note and how it connects, coloured by area',
    },
  ],
  contributes: [noteSections.add({ order: 60, view: LocalMap })],
};
