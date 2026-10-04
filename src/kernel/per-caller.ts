// A provider whose implementation depends on who calls it, such as storage namespaced by extension:
// `make` runs once for each extension that requires the contract, with that extension's id. `forget`
// drops what a caller left behind: when the caller is removed, and after a conformance run.
const PER_CALLER = Symbol.for('pip.perCaller');

export interface PerCallerDef<T> {
  make: (caller: string) => T;
  forget?: (caller: string) => void | Promise<void>;
}

export interface PerCaller<T> {
  readonly [PER_CALLER]: PerCallerDef<T>;
}

export const perCaller = <T>(
  make: (caller: string) => T,
  opts: { forget?: PerCallerDef<T>['forget'] } = {},
): PerCaller<T> => ({ [PER_CALLER]: { make, forget: opts.forget } }) as PerCaller<T>;

export const isPerCaller = (v: unknown): v is PerCaller<object> =>
  typeof v === 'object' && v !== null && PER_CALLER in v;

export const perCallerDef = <T>(p: PerCaller<T>): PerCallerDef<T> => p[PER_CALLER];
