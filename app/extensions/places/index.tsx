// Places: every place note with `geo` on a street map, with days there and events, and the trail (#/places/).
import { MapPinIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { Places } from './Places.tsx';
import { placesPage } from './routes.ts';

export const places: Extension = {
  id: 'places',
  page: (path) => (placesPage.match(path) ? { title: 'Places', body: <Places /> } : null),
  nav: [
    {
      label: 'Places',
      href: placesPage.href(),
      icon: MapPinIcon,
      keys: 'g p',
      order: 30,
      summary: 'Where things happen, on a map',
    },
  ],
};
