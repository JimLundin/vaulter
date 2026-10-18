import type { HistoricalReference, TransactionRef } from '@/core/store/index.ts';
import type { SourceDatabase, SourceLeadRef } from './records.ts';

const select = { url: true, title: true, provenance: true, source: true, available: true } as const;
export function readSourceLeads(
  db: SourceDatabase,
  options: { snapshot?: TransactionRef; includeUnavailable?: boolean } = {},
) {
  const view = options.snapshot ? db.at(options.snapshot) : db;
  return view.entities.sourceLeads.query({
    select,
    limit: null,
    ...(options.includeUnavailable ? {} : { where: { available: { eq: true } } }),
  });
}
export type SourceLeadRecord = Awaited<ReturnType<typeof readSourceLeads>>[number];

/** Direct reading retains unavailable records, allowing explicit removal presentation. */
export function readSourceLead(
  db: SourceDatabase,
  lead: SourceLeadRef,
  options: { snapshot?: TransactionRef } = {},
) {
  const view = options.snapshot ? db.at(options.snapshot) : db;
  return view.entities.sourceLeads.get(lead, { select });
}

/** Historical lead reading is provenance reading, distinct from documentSources evidence reading. */
export async function readHistoricalSourceLead(db: SourceDatabase, address: HistoricalReference) {
  if (address.type !== 'source.lead') throw new Error('The selected record is not a Source lead');
  const resolved = await db.history.resolve(address);
  const recorded = await readSourceLead(db, resolved.entity as SourceLeadRef, {
    snapshot: resolved.transaction,
  });
  if (!recorded) throw new Error('Source lead is absent from its selected snapshot');
  return { recorded, current: await readSourceLead(db, recorded) };
}
