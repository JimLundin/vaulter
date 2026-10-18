import type { HistoricalReference, TransactionContext } from '@/core/store/index.ts';
import type { ObservationDatabase, ObservationRef } from './records.ts';
import { parseObservation, type ObservationValue } from './values.ts';

export interface ObservationInput {
  value: ObservationValue;
  /** Subject/context association selects the recorded native state, when supplied. */
  context?: HistoricalReference;
  /** Preserved external source material; never an invented legacy Exchange. */
  provenance?: HistoricalReference;
}
export function createObservation(
  db: ObservationDatabase,
  input: ObservationInput,
  context: TransactionContext = {},
): Promise<ObservationRef> {
  const value = parseObservation(input.value);
  return db.transaction(context, (tx) =>
    tx.entities.observations.insert({
      value,
      ...(input.context ? { context: input.context } : {}),
      ...(input.provenance ? { provenance: input.provenance } : {}),
      available: true,
    }),
  );
}
export function reviseObservation(
  db: ObservationDatabase,
  observation: ObservationRef,
  value: ObservationValue,
  context: TransactionContext = {},
): Promise<void> {
  const parsed = parseObservation(value);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.observations.get(observation, {
      select: { available: true },
    });
    if (!current?.available) throw new Error('Observation is unavailable');
    await tx.entities.observations.update({ ...current, value: parsed });
  });
}
export function removeObservation(
  db: ObservationDatabase,
  observation: ObservationRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.observations.get(observation, { select: {} });
    if (!current) throw new Error('Observation is unavailable');
    await tx.entities.observations.update({ ...current, available: false });
  });
}
