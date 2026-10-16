import type { EntityDefinition } from './schema.ts';

export const entityIdentity: unique symbol = Symbol('Vaulter entity');
interface IdentityOf<Name extends string> {
  readonly [entityIdentity]: Name;
}
export type EntityRef<E extends EntityDefinition> = IdentityOf<E['name']>;
export interface Identity {
  readonly database: object;
  readonly id: string;
  readonly type: string;
  readonly sequence: number;
  readonly issuance?: Issuance;
}
/** One transaction's issued objects become accepted together, or are invalidated together. */
export interface Issuance {
  sequence: number;
  valid: boolean;
}
const identities = new WeakMap<object, Identity>();

export function identify(database: object, value: unknown, type?: string): Identity {
  const token = value && typeof value === 'object' ? Reflect.get(value, entityIdentity) : undefined;
  const identity = token && typeof token === 'object' ? identities.get(token) : undefined;
  if (
    !identity ||
    identity.issuance?.valid === false ||
    identity.database !== database ||
    (type !== undefined && identity.type !== type)
  )
    throw new Error('Expected an entity object of the correct type from this database');
  return identity.issuance ? { ...identity, sequence: identity.issuance.sequence } : identity;
}

export function materialize(identity: Identity, fields: Record<string, unknown>): object {
  const token = Object.freeze({});
  identities.set(token, Object.freeze(identity));
  Object.defineProperty(fields, entityIdentity, { value: token, enumerable: true });
  return Object.freeze(fields);
}

/** Deliberately distinct from attribute value equality and JavaScript object reference equality. */
export function sameEntity(left: unknown, right: unknown): boolean {
  if (!(left && right) || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = identities.get(Reflect.get(left, entityIdentity));
  const b = identities.get(Reflect.get(right, entityIdentity));
  return !!a && !!b && a.database === b.database && a.type === b.type && a.id === b.id;
}
