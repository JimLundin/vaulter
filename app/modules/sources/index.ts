// biome-ignore-all lint/performance/noBarrelFile: Source material has one owner interface.
export {
  SourceDocument,
  SourceLead,
  SourceAssociation,
  sourceEntities,
  sourceSchema,
} from './records.ts';
export type {
  SourceDatabase,
  SourceDocumentRef,
  SourceLeadRef,
  SourceAssociationRef,
} from './records.ts';
export {
  insertSourceAssociation,
  updateSourceAssociation,
  createSourceAssociation,
  reviseSourceAssociation,
  readSourceAssociations,
  readSourceAssociation,
  readHistoricalSourceAssociation,
  sourceAssociationStatus,
} from './associations.ts';
export type {
  SourceAssociationInput,
  SourceAssociationPatch,
  SourceAssociationRecord,
} from './associations.ts';
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
