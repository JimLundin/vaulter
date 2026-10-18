import { e, type DomainDatabase, type EntityRef } from '@/core/store/index.ts';

/** A recorded choice; availability does not assert that it is still in force. */
export const Decision = e.entity('decision', {
  text: e.string(),
  date: e.string().optional(),
  rationale: e.string().optional(),
  attribution: e.string().optional(),
  available: e.boolean(),
});
export const DecisionSource = e.entity('decision.source', {
  decision: e.ref(Decision),
  source: e.historicalRef(),
});
export const decisionEntities = { decisions: Decision, decisionSources: DecisionSource } as const;
export const decisionSchema = e.registry(decisionEntities);
export type DecisionDatabase = DomainDatabase<typeof decisionEntities>;
export type DecisionRef = EntityRef<typeof Decision>;
