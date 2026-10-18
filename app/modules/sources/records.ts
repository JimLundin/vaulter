import { e, type DomainDatabase, type EntityRef } from '@/core/store/index.ts';

/** An uncaptured external pointer. A lead is not captured text or supporting evidence. */
export const SourceLead = e.entity('source.lead', {
  url: e.string(),
  title: e.string().optional(),
  provenance: e.json().optional(),
  source: e.historicalRef().optional(),
  available: e.boolean(),
});

/** Independently captured material. Recording a document does not certify its assertions. */
export const SourceDocument = e.entity('source.document', {
  key: e.string(),
  title: e.string(),
  text: e.string(),
  origin: e.string(),
  attribution: e.string(),
  capturedAt: e.datetime(),
  occurredAt: e.string().optional(),
  available: e.boolean(),
  lead: e.historicalRef().optional(),
});
/** Recorded source context, distinct from editorial membership or supporting evidence. */
export const SourceAssociation = e.entity('source.association', {
  key: e.string(),
  role: e.enum('topic', 'place', 'suppliedContext'),
  direction: e.enum('directed', 'unrecorded'),
  source: e.retainedStateRef().optional(),
  target: e.retainedStateRef().optional(),
  label: e.string().optional(),
  placement: e.retainedStateRef().optional(),
  placementOrder: e.string().optional(),
  provenance: e.set(e.retainedStateRef()),
  available: e.boolean(),
});
export const sourceEntities = {
  sourceDocuments: SourceDocument,
  sourceLeads: SourceLead,
  sourceAssociations: SourceAssociation,
} as const;
export const sourceSchema = e.registry(sourceEntities);
export type SourceDatabase = DomainDatabase<typeof sourceEntities>;
export type SourceLeadRef = EntityRef<typeof SourceLead>;
export type SourceDocumentRef = EntityRef<typeof SourceDocument>;
export type SourceAssociationRef = EntityRef<typeof SourceAssociation>;
