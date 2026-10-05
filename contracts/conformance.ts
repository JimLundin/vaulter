// Conformance suites: what every provider of a contract must do. A contract ships one as
// contracts/<name>/conformance.ts, and CI runs it against every extension in the repo that provides the
// contract (conformance.test.ts), on every push. Only CI uses this: the page doesn't carry the suites.

import type { ExpectStatic } from 'vitest';

export interface Check<T> {
  name: string;
  /** `use` is the provider as a fresh caller has it. */
  run: (use: T, expect: ExpectStatic) => unknown;
}

export interface Suite<T> {
  /** The export a provider is found by: a function of the caller's id, or the implementation. */
  readonly provider: string;
  readonly checks: Check<T>[];
}

/** Time for what a provider does after a call returns, such as telling its listeners. */
export const settle = () => new Promise((ok) => setTimeout(ok, 20));

export const defineConformance = <T>(provider: string, checks: Check<T>[]): Suite<T> => ({
  provider,
  checks,
});
