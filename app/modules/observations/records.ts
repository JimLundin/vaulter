import { e, type DomainDatabase, type EntityRef } from '@/core/store/index.ts';

const Observation = e.entity('observations.observation', {
  value: e.json(),
  context: e.historicalRef().optional(),
  provenance: e.historicalRef().optional(),
  available: e.boolean(),
});
export const observationEntities = { observations: Observation } as const;
export const observationSchema = e.registry(observationEntities);
export type ObservationDatabase = DomainDatabase<typeof observationEntities>;
export type ObservationRef = EntityRef<typeof Observation>;
