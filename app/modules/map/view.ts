import type { HistoricalReference } from '@/core/store/index.ts';
import type { CoordinateRecord } from './reading.ts';
import { decimalDegrees } from './coordinates.ts';

export interface MapSubject {
  reference: HistoricalReference;
  label: string;
}
export interface MapEntry {
  id: string;
  label: string;
  record: CoordinateRecord;
}
export interface MapData {
  entries: MapEntry[];
  subjects: MapSubject[];
}
export function mapMarkers(entries: readonly MapEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    latitude: decimalDegrees(entry.record.coordinates.latitude),
    longitude: decimalDegrees(entry.record.coordinates.longitude),
  }));
}
