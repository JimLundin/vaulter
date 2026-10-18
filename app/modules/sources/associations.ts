import { z } from 'zod';
import {
  clear,
  type RetainedStateReference,
  type Transaction,
  type TransactionContext,
  type TransactionRef,
} from '@/core/store/index.ts';
import type { sourceEntities, SourceAssociationRef, SourceDatabase } from './records.ts';

export interface SourceAssociationInput {
  key: string;
  role: 'topic' | 'place' | 'suppliedContext';
  direction: 'directed' | 'unrecorded';
  /** Only recorded endpoints belong here; containment does not establish direction. */
  source?: RetainedStateReference;
  target?: RetainedStateReference;
  label?: string;
  /** Independent external-source placement, retaining known order without inventing one. */
  placement?: RetainedStateReference;
  placementOrder?: string;
  provenance?: readonly RetainedStateReference[];
  available?: boolean;
}
export type SourceAssociationPatch = Partial<
  Omit<
    SourceAssociationInput,
    'key' | 'source' | 'target' | 'label' | 'placement' | 'placementOrder'
  >
> & {
  source?: RetainedStateReference | null;
  target?: RetainedStateReference | null;
  label?: string | null;
  placement?: RetainedStateReference | null;
  placementOrder?: string | null;
};
const fields = z.object({
  key: z.string().min(1),
  role: z.enum(['topic', 'place', 'suppliedContext']),
  direction: z.enum(['directed', 'unrecorded']),
  label: z.string().optional(),
  placementOrder: z.string().min(1).optional(),
  available: z.boolean(),
});

/** Owner admission can join other writes in one caller-owned Transaction. */
export function insertSourceAssociation(
  tx: Transaction<typeof sourceEntities>,
  input: SourceAssociationInput,
): Promise<SourceAssociationRef> {
  const values = fields.parse({ ...input, available: input.available ?? true });
  if (input.placementOrder !== undefined && !input.placement)
    throw new Error('Source association order requires recorded placement');
  return tx.entities.sourceAssociations.insert({
    ...values,
    ...(input.source && { source: input.source }),
    ...(input.target && { target: input.target }),
    ...(input.placement && { placement: input.placement }),
    provenance: input.provenance ?? [],
  });
}

export function createSourceAssociation(
  db: SourceDatabase,
  input: SourceAssociationInput,
  context: TransactionContext = {},
): Promise<SourceAssociationRef> {
  return db.transaction(context, (tx) => insertSourceAssociation(tx, input));
}

/** Revision can clarify a candidate, withdraw it or restore it without replacing its identity. */
export async function updateSourceAssociation(
  tx: Transaction<typeof sourceEntities>,
  association: SourceAssociationRef,
  patch: SourceAssociationPatch,
): Promise<void> {
  const current = await tx.entities.sourceAssociations.get(association, { select });
  if (!current) throw new Error('Source association is absent');
  const combined = { ...current, ...patch };
  if (combined.placementOrder != null && !combined.placement)
    throw new Error('Source association order requires recorded placement');
  fields.parse({
    ...combined,
    label: combined.label ?? undefined,
    placementOrder: combined.placementOrder ?? undefined,
  });
  await tx.entities.sourceAssociations.update({
    ...current,
    ...(patch.role !== undefined && { role: patch.role }),
    ...(patch.direction !== undefined && { direction: patch.direction }),
    ...(patch.source !== undefined && { source: patch.source ?? clear }),
    ...(patch.target !== undefined && { target: patch.target ?? clear }),
    ...(patch.label !== undefined && { label: patch.label ?? clear }),
    ...(patch.placement !== undefined && { placement: patch.placement ?? clear }),
    ...(patch.placementOrder !== undefined && { placementOrder: patch.placementOrder ?? clear }),
    ...(patch.provenance !== undefined && { provenance: patch.provenance }),
    ...(patch.available !== undefined && { available: patch.available }),
  });
}

export function reviseSourceAssociation(
  db: SourceDatabase,
  association: SourceAssociationRef,
  patch: SourceAssociationPatch,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, (tx) => updateSourceAssociation(tx, association, patch));
}

const select = {
  key: true,
  role: true,
  direction: true,
  source: true,
  target: true,
  label: true,
  placement: true,
  placementOrder: true,
  provenance: true,
  available: true,
} as const;

export function readSourceAssociations(
  db: SourceDatabase,
  options: { snapshot?: TransactionRef; includeUnavailable?: boolean } = {},
) {
  const view = options.snapshot ? db.at(options.snapshot) : db;
  return view.entities.sourceAssociations.query({
    select,
    limit: null,
    ...(options.includeUnavailable ? {} : { where: { available: { eq: true } } }),
  });
}
export type SourceAssociationRecord = Awaited<ReturnType<typeof readSourceAssociations>>[number];

export function sourceAssociationStatus(
  association: Pick<SourceAssociationRecord, 'direction' | 'source' | 'target'>,
): 'candidate' | 'resolved' {
  return association.direction === 'directed' && association.source && association.target
    ? 'resolved'
    : 'candidate';
}

export function readSourceAssociation(
  db: SourceDatabase,
  association: SourceAssociationRef,
  options: { snapshot?: TransactionRef } = {},
) {
  const view = options.snapshot ? db.at(options.snapshot) : db;
  return view.entities.sourceAssociations.get(association, { select });
}

export async function readHistoricalSourceAssociation(
  db: SourceDatabase,
  address: RetainedStateReference,
) {
  if (address.type !== 'source.association')
    throw new Error('The selected record is not a Source association');
  const resolved = await db.history.resolveRetainedState(address);
  const association = resolved.entity as SourceAssociationRef;
  return {
    state: resolved.state,
    recorded: await readSourceAssociation(db, association, { snapshot: resolved.transaction }),
    current: await readSourceAssociation(db, association),
  };
}
