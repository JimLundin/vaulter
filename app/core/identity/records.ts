import { e, type DomainDatabase, type EntityRef } from '@/core/store/index.ts';

/** Identity anchors retain the exact recorded states on which a merge was based. */
export const IdentityRedirect = e.entity('identity.redirect', {
  source: e.historicalRef(),
  target: e.historicalRef(),
  available: e.boolean(),
  reason: e.string().optional(),
  provenance: e.set(e.historicalRef()),
});
export const identityEntities = { identityRedirects: IdentityRedirect } as const;
export const identitySchema = e.registry(identityEntities);
export type IdentityDatabase = DomainDatabase<typeof identityEntities>;
export type IdentityRedirectRef = EntityRef<typeof IdentityRedirect>;
