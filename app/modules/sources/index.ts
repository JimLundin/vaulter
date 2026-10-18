// biome-ignore-all lint/performance/noBarrelFile: Source material has one owner interface.
export { SourceDocument, SourceLead, sourceEntities, sourceSchema } from './records.ts';
export type { SourceDatabase, SourceDocumentRef, SourceLeadRef } from './records.ts';
export {
  createSourceLead,
  reviseSourceLead,
  removeSourceLead,
  captureSourceDocument,
  isSourceLeadUrl,
} from './operations.ts';
export type { SourceLeadInput, SourceLeadPatch, SourceDocumentInput } from './operations.ts';
export { readSourceLead, readSourceLeads, readHistoricalSourceLead } from './leads.ts';
export type { SourceLeadRecord } from './leads.ts';
export { documentSources } from './reading.ts';
export type { SourceReading, SourceProjection } from './reading.ts';
