import { e, type DomainDatabase, type EntityRef } from '@/core/store/index.ts';

const Coordinate = e.entity('map.coordinate', {
  subject: e.historicalRef(),
  coordinates: e.json(),
  available: e.boolean(),
});

export const mapEntities = { mapCoordinates: Coordinate } as const;
export const mapSchema = e.registry(mapEntities);
export type MapDatabase = DomainDatabase<typeof mapEntities>;
export type CoordinateRef = EntityRef<typeof Coordinate>;
