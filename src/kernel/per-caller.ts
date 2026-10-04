// A provider whose implementation depends on who calls it, such as storage namespaced by extension:
// `make` runs once for each extension that requires the contract, with that extension's id.
const PER_CALLER = Symbol('pip.perCaller');

export interface PerCaller<T> {
  readonly [PER_CALLER]: (caller: string) => T;
}

export const perCaller = <T>(make: (caller: string) => T): PerCaller<T> =>
  ({ [PER_CALLER]: make }) as PerCaller<T>;

export const isPerCaller = (v: unknown): v is PerCaller<object> =>
  typeof v === 'object' && v !== null && PER_CALLER in v;

export const forCaller = <T>(p: PerCaller<T>, caller: string): T => p[PER_CALLER](caller);
