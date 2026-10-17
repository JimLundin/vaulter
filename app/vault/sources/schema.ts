import { e } from '@/vault/eav/index.ts';

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
});
export const sourceEntities = { sourceDocuments: SourceDocument } as const;
