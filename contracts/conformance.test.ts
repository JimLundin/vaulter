// Every contract's conformance suite against every extension in the repo that provides it, through
// real handles, each check as a fresh caller: what CI runs on every push, draft branches included, so
// a provider Vaulter writes is held to its contract before anyone accepts it.
import { afterAll, describe, expect, it } from 'vitest';
import { runSuite } from '../src/kernel/conformance.ts';
import { repoConformance } from '../src/kernel/testing.ts';

const repo = await repoConformance();
afterAll(() => repo.kernel.dispose());

it('starts every extension in the repo', () => {
  expect(repo.refused).toEqual([]);
});

let n = 0;
for (const { suite, contract, providers } of repo.suites)
  for (const provider of providers)
    describe(`${suite.contract} by ${provider}`, () => {
      it.each(suite.checks.map((c) => c.name))('%s', async (name) => {
        const caller = repo.kernel.caller(`check-${++n}`);
        try {
          const only = { ...suite, checks: suite.checks.filter((c) => c.name === name) };
          const [result] = await runSuite(only, () => caller.use(contract, provider));
          expect(result.error).toBeUndefined();
        } finally {
          await caller.drop();
        }
      });
    });
