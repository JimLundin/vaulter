import {
  clear,
  sameEntity,
  type HistoricalReference,
  type TransactionContext,
} from '@/core/store/index.ts';
import type { IdentityDatabase, IdentityRedirectRef } from './records.ts';
import { validateRedirects } from './validation.ts';

export interface IdentityRedirectInput {
  source: HistoricalReference;
  target: HistoricalReference;
  reason?: string;
  provenance?: readonly HistoricalReference[];
}

/** Admission records correspondence only; it never removes records or rewrites their references. */
export async function createIdentityRedirect(
  db: IdentityDatabase,
  input: IdentityRedirectInput,
  context: TransactionContext = {},
): Promise<IdentityRedirectRef> {
  await Promise.all(
    [input.source, input.target, ...(input.provenance ?? [])].map((address) =>
      db.history.resolve(address),
    ),
  );
  return db.transaction(context, async (tx) => {
    const edges = await tx.entities.identityRedirects.query({
      select: { source: true, target: true },
      where: { available: { eq: true } },
      limit: null, // Uniqueness and cycle admission must consider every active redirect.
    });
    validateRedirects([...edges, input]);
    return tx.entities.identityRedirects.insert({
      ...input,
      provenance: input.provenance ?? [],
      available: true,
    });
  });
}

export interface IdentityRedirectPatch {
  target?: HistoricalReference;
  available?: boolean;
  reason?: string | null;
  provenance?: readonly HistoricalReference[];
}

/** Corrections and withdrawal append history while retaining the original merge evidence. */
export async function reviseIdentityRedirect(
  db: IdentityDatabase,
  redirect: IdentityRedirectRef,
  patch: IdentityRedirectPatch,
  context: TransactionContext = {},
): Promise<void> {
  await Promise.all(
    [...(patch.target ? [patch.target] : []), ...(patch.provenance ?? [])].map((address) =>
      db.history.resolve(address),
    ),
  );
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.identityRedirects.get(redirect, {
      select: { source: true, target: true, available: true },
    });
    if (!current) throw new Error('Identity redirect is unavailable');
    const edges = await tx.entities.identityRedirects.query({
      select: { source: true, target: true },
      where: { available: { eq: true } },
      limit: null, // Revisions must retain global uniqueness and acyclic correspondence.
    });
    const candidate = { ...current, ...patch };
    validateRedirects([candidate]);
    validateRedirects([
      ...edges.filter((edge) => !sameEntity(edge, redirect)),
      ...(candidate.available ? [candidate] : []),
    ]);
    await tx.entities.identityRedirects.update({
      ...current,
      ...(patch.target !== undefined && { target: patch.target }),
      ...(patch.available !== undefined && { available: patch.available }),
      ...(patch.reason !== undefined && { reason: patch.reason ?? clear }),
      ...(patch.provenance !== undefined && { provenance: patch.provenance }),
    });
  });
}
