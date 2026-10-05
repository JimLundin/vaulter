// Every contract's conformance suite against every extension in the repo that provides it, each check
// as a fresh caller: what CI runs on every push, so a provider Vaulter writes is held to its contract
// before anyone merges it.
import { describe, expect, it } from 'vitest';
import { REPO, startApp } from '../src/kernel/testing.ts';
import type { Suite } from './conformance.ts';

// Previews included: they are held to their contracts before anyone turns them on.
const kernel = await startApp(REPO, {
  settings: { current: { enabled: Object.fromEntries(REPO.map((id) => [id, true])) } },
});
const suites = import.meta.glob<Suite<unknown>>('./*/conformance.ts', {
  eager: true,
  import: 'default',
});

it('starts every extension in the repo', () => {
  expect(kernel.extensions().filter((e) => e.status !== 'running')).toEqual([]);
});

let n = 0;
for (const [path, suite] of Object.entries(suites))
  for (const { id, exports } of kernel.running().filter((r) => suite.provider in r.exports))
    describe(`${path.split('/')[1]} by ${id}`, () => {
      it.each(suite.checks.map((check) => [check.name, check] as const))('%s', async (_, check) => {
        const caller = `check-${++n}`;
        const provider = exports[suite.provider];
        const forget = exports.forget as ((id: string) => Promise<void>) | undefined;
        try {
          await check.run(typeof provider === 'function' ? provider(caller) : provider, expect);
        } finally {
          await forget?.(caller);
        }
      });
    });
