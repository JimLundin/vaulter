// biome-ignore-all lint/performance/noBarrelFile: Identity has one declared public interface.
export { identityEntities, identitySchema } from './records.ts';
export type { IdentityDatabase, IdentityRedirectRef } from './records.ts';
export { createIdentityRedirect, reviseIdentityRedirect } from './operations.ts';
export type { IdentityRedirectInput, IdentityRedirectPatch } from './operations.ts';
export { resolveCurrentIdentity, resolveHistoricalIdentity } from './reading.ts';
