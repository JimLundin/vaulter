// A provider whose implementation depends on who calls it, such as storage namespaced by extension:
// `make` runs once for each extension that requires the contract, with that extension's id and its
// static fields (what it declared: its secrets and hosts, its permissions). `forget`
// drops what a caller stored, when it is removed or when a check's caller is dropped.
import type { Statics } from './extension.ts';

const PER_CALLER = Symbol.for('vaulter.perCaller');

export interface PerCallerDef<T> {
  make: (caller: string, statics: Statics) => T;
  forget?: (caller: string) => void | Promise<void>;
}

export interface PerCaller<T> {
  readonly [PER_CALLER]: PerCallerDef<T>;
}

export const perCaller = <T>(
  make: (caller: string, statics: Statics) => T,
  opts: Pick<PerCallerDef<T>, 'forget'> = {},
): PerCaller<T> => ({ [PER_CALLER]: { make, ...opts } }) as PerCaller<T>;

export const isPerCaller = (v: unknown): v is PerCaller<object> =>
  typeof v === 'object' && v !== null && PER_CALLER in v;

export const perCallerDef = <T>(p: PerCaller<T>): PerCallerDef<T> => p[PER_CALLER];
