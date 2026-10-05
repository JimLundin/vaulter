// Conformance suites: what every provider of a contract must do. A contract ships one as
// contracts/<name>/conformance.ts, and CI runs it against every extension in the repo that provides the
// contract, through real handles (conformance.test.ts), on every push, draft branches included. Only CI
// uses this: it isn't part of the kernel, and the page doesn't carry the suites.

import type { ExpectStatic } from 'vitest';
import type { Contract } from '#kernel';

export interface Check<T> {
  name: string;
  /** `use` is a fresh caller's handle on the provider. */
  run: (use: T, expect: ExpectStatic) => unknown;
}

export interface Suite<T> {
  readonly contract: string;
  readonly checks: Check<T>[];
}

export const defineConformance = <T>(contract: Contract<T>, checks: Check<T>[]): Suite<T> => ({
  contract: contract.key,
  checks,
});
