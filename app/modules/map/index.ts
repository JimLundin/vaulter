// biome-ignore-all lint/performance/noBarrelFile: Map exposes one public data interface.
export { mapEntities, mapSchema } from './records.ts';
export type { MapDatabase, CoordinateRef } from './records.ts';
export { parseCoordinates } from './coordinates.ts';
export type { CoordinateValue } from './coordinates.ts';
export { createCoordinates, reviseCoordinates, removeCoordinates } from './operations.ts';
export type { CoordinateInput } from './operations.ts';
export { readCoordinates } from './reading.ts';
export type { CoordinateQuery, CoordinateRecord } from './reading.ts';
export { decimalDegrees } from './coordinates.ts';
export { mapRoute } from './routes.ts';
export type { MapData, MapEntry, MapSubject } from './view.ts';
export type { MapActions } from './presentation/MapPage.tsx';
