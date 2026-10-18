import type { HistoricalReference, TransactionContext } from '@/core/store/index.ts';
import { parseCoordinates, type CoordinateValue } from './coordinates.ts';
import type { CoordinateRef, MapDatabase } from './records.ts';

export interface CoordinateInput {
  subject: HistoricalReference;
  coordinates: CoordinateValue;
}

/** Admission of the mandatory subject is engine-validated in the same transaction. */
export function createCoordinates(
  db: MapDatabase,
  input: CoordinateInput,
  context: TransactionContext = {},
): Promise<CoordinateRef> {
  const coordinates = parseCoordinates(input.coordinates);
  return db.transaction(context, (tx) =>
    tx.entities.mapCoordinates.insert({ subject: input.subject, coordinates, available: true }),
  );
}

/** Corrections retain identity and the original subject association. */
export function reviseCoordinates(
  db: MapDatabase,
  coordinate: CoordinateRef,
  value: CoordinateValue,
  context: TransactionContext = {},
): Promise<void> {
  const coordinates = parseCoordinates(value);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.mapCoordinates.get(coordinate, {
      select: { available: true },
    });
    if (!current?.available) throw new Error('Coordinate record is unavailable');
    await tx.entities.mapCoordinates.update({ ...current, coordinates });
  });
}

export function removeCoordinates(
  db: MapDatabase,
  coordinate: CoordinateRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.mapCoordinates.get(coordinate, { select: {} });
    if (!current) throw new Error('Coordinate record is unavailable');
    await tx.entities.mapCoordinates.update({ ...current, available: false });
  });
}
