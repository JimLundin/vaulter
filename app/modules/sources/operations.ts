import { z } from 'zod';
import {
  clear,
  type HistoricalReference,
  type JsonObject,
  type TransactionContext,
} from '@/core/store/index.ts';
import type { SourceDatabase, SourceDocumentRef, SourceLeadRef } from './records.ts';

/** Validate the link while retaining the original string, including spelling and escapes. */
export function isSourceLeadUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject characters browsers silently ignore.
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
const fields = z
  .object({
    url: z.string().refine(isSourceLeadUrl, 'Source leads require an absolute HTTP or HTTPS URL'),
    title: z.string().optional(),
    provenance: z.record(z.string(), z.json()).optional(),
  })
  .strict();
export interface SourceLeadInput {
  url: string;
  title?: string;
  /** Source-supplied metadata, separate from retained entity identity and transaction authorship. */
  provenance?: JsonObject;
  /** Optional exact historical source record from which this lead was obtained. */
  source?: HistoricalReference;
}
export interface SourceLeadPatch {
  url?: string;
  title?: string | null;
  provenance?: JsonObject | null;
  source?: HistoricalReference | null;
}

export function createSourceLead(
  db: SourceDatabase,
  input: SourceLeadInput,
  context: TransactionContext = {},
): Promise<SourceLeadRef> {
  const { source, ...values } = input;
  const data = fields.parse(values);
  return db.transaction(context, (tx) =>
    tx.entities.sourceLeads.insert({ ...data, ...(source && { source }), available: true }),
  );
}

export function reviseSourceLead(
  db: SourceDatabase,
  lead: SourceLeadRef,
  patch: SourceLeadPatch,
  context: TransactionContext = {},
): Promise<void> {
  const { source, ...values } = patch;
  const data = fields
    .partial()
    .extend({ title: z.string().nullish(), provenance: z.record(z.string(), z.json()).nullish() })
    .parse(values);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.sourceLeads.get(lead, { select: { available: true } });
    if (!current?.available) throw new Error('Source lead is unavailable');
    await tx.entities.sourceLeads.update({
      ...current,
      ...(data.url !== undefined && { url: data.url }),
      ...(data.title !== undefined && { title: data.title ?? clear }),
      ...(data.provenance !== undefined && { provenance: data.provenance ?? clear }),
      ...(source !== undefined && { source: source ?? clear }),
    });
  });
}

/** Retain the original lead and its historical states when removing it from current views. */
export function removeSourceLead(
  db: SourceDatabase,
  lead: SourceLeadRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.sourceLeads.get(lead, { select: { available: true } });
    if (!current?.available) throw new Error('Source lead is unavailable');
    await tx.entities.sourceLeads.update({ ...current, available: false });
  });
}

export interface SourceDocumentInput {
  key: string;
  title: string;
  text: string;
  origin: string;
  attribution: string;
  capturedAt: Date;
  occurredAt?: string;
  /** Explicitly select the lead state that preceded this capture. */
  lead?: HistoricalReference;
}

/** A new document retains actual capture metadata; it never changes the lead into a capture. */
export function captureSourceDocument(
  db: SourceDatabase,
  input: SourceDocumentInput,
  context: TransactionContext = {},
): Promise<SourceDocumentRef> {
  return db.transaction(context, async (tx) => {
    if (input.lead) {
      if (input.lead.type !== 'source.lead')
        throw new Error('Capture origin must select a Source lead');
      await db.history.resolve(input.lead);
    }
    return tx.entities.sourceDocuments.insert({ ...input, available: true });
  });
}
