// A provider whose implementation depends on who calls it, such as storage namespaced by extension:
// `make` runs once for each extension that requires the contract, with that extension's id. `release`
// lets go of what a caller registered (its handlers, its tools) when it stops; `forget` drops what it
// stored, when it is removed and after a conformance run.
const PER_CALLER = Symbol.for('pip.perCaller');

export interface PerCallerDef<T> {
  make: (caller: string) => T;
  release?: (caller: string) => void | Promise<void>;
  forget?: (caller: string) => void | Promise<void>;
}

export interface PerCaller<T> {
  readonly [PER_CALLER]: PerCallerDef<T>;
}

export const perCaller = <T>(
  make: (caller: string) => T,
  opts: Pick<PerCallerDef<T>, 'release' | 'forget'> = {},
): PerCaller<T> => ({ [PER_CALLER]: { make, ...opts } }) as PerCaller<T>;

export const isPerCaller = (v: unknown): v is PerCaller<object> =>
  typeof v === 'object' && v !== null && PER_CALLER in v;

export const perCallerDef = <T>(p: PerCaller<T>): PerCallerDef<T> => p[PER_CALLER];
