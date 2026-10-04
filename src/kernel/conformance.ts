// Conformance suites: what every provider of a contract must do. A contract ships one as
// contracts/<name>/conformance.ts; the kernel runs it against a scratch instance of each provider before
// that provider may satisfy a `requires`, and CI runs the same suite under Vitest (testing.ts).
import type { AnyContract, Use } from './contract.ts';

export interface Asserts {
  ok: (v: unknown, message?: string) => void;
  /** Deep equality of plain values. */
  equal: (actual: unknown, expected: unknown, message?: string) => void;
  rejects: (p: Promise<unknown>, message?: string) => Promise<void>;
}

export interface Check<T> {
  name: string;
  run: (use: T, t: Asserts) => void | Promise<void>;
}

export interface Suite<T> {
  readonly kind: 'conformance';
  readonly contract: string;
  readonly checks: Check<T>[];
}

export const defineConformance = <C extends AnyContract>(
  contract: C,
  checks: Check<Use<C>>[],
): Suite<Use<C>> => ({ kind: 'conformance', contract: contract.key, checks });

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    ka.length === kb.length &&
    ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export const asserts: Asserts = {
  ok(v, message) {
    if (!v) throw new Error(message ?? `expected a true value, got ${show(v)}`);
  },
  equal(actual, expected, message) {
    if (!deepEqual(actual, expected))
      throw new Error(message ?? `expected ${show(expected)}, got ${show(actual)}`);
  },
  async rejects(p, message) {
    try {
      await p;
    } catch {
      return;
    }
    throw new Error(message ?? 'expected a rejection');
  },
};

export interface CheckResult {
  name: string;
  ok: boolean;
  error?: string;
}

/** Runs every check against a fresh instance from `make`. */
export async function runSuite<T>(suite: Suite<T>, make: (n: number) => T): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const [n, check] of suite.checks.entries()) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: checks run one at a time
      await check.run(make(n), asserts);
      out.push({ name: check.name, ok: true });
    } catch (e) {
      out.push({ name: check.name, ok: false, error: (e as Error).message });
    }
  }
  return out;
}
