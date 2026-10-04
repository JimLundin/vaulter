// The map: every topical note as a dot, by area, with links and relations as edges (#/map/); under each
// note, its neighbourhood. The layout is computed in the worker (core/heavy.ts, core/vault-map.ts).
import { WaypointsIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { MapView } from './MapView.tsx';
import { LocalMap } from './LocalMap.tsx';

export const map: Extension = {
  id: 'map',
  page: (path) => (path === '/map/' ? { title: 'Map', body: <MapView /> } : null),
  nav: [
    {
      label: 'Map',
      href: '/map/',
      icon: WaypointsIcon,
      keys: 'g m',
      order: 20,
      summary: 'Every note and how it connects, coloured by area',
    },
  ],
  noteSections: [{ order: 60, view: LocalMap }],
};
