import { e, openDatabase, type HistoricalReference, type RetainedStateReference } from './index.ts';

const Note = e.entity('retained-test.note', { text: e.string() });
const Link = e.entity('retained-test.link', {
  state: e.retainedStateRef(),
  evidence: e.historicalRef(),
});

export async function retainedReferenceContract() {
  await using db = await openDatabase({ schema: e.registry({ notes: Note, links: Link }) });
  const note = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Source' }));
  const transaction = (await db.history.transactions.first({ select: {} }))!;
  const state: RetainedStateReference = await db.history.retainedStateReference(transaction, note);
  const evidence: HistoricalReference = await db.history.reference(transaction, note);
  await db.transaction((tx) => tx.entities.links.insert({ state, evidence }));
  // @ts-expect-error Retained state is not supporting evidence.
  await db.transaction((tx) => tx.entities.links.insert({ state, evidence: state }));
  // @ts-expect-error Evidence addresses do not select the retained-state reference contract.
  await db.transaction((tx) => tx.entities.links.insert({ state: evidence, evidence }));
  const resolved = await db.history.resolveRetainedState(state);
  const availability: 'live' | 'deleted' = resolved.state;
  return availability;
}
