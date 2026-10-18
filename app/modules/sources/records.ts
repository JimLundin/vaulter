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
export const sourceEntities = { sourceDocuments: SourceDocument, sourceLeads: SourceLead } as const;
export const sourceSchema = e.registry(sourceEntities);
export type SourceDatabase = DomainDatabase<typeof sourceEntities>;
export type SourceLeadRef = EntityRef<typeof SourceLead>;
export type SourceDocumentRef = EntityRef<typeof SourceDocument>;
