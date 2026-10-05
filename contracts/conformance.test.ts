// Every contract's conformance suite against every extension in the repo that provides it, through
// real handles, each check as a fresh caller: what CI runs on every push, draft branches included, so
// a provider Vaulter writes is held to its contract before anyone accepts it.
import { afterAll, describe, expect, it } from 'vitest';
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
          const check = suite.checks.find((c) => c.name === name)!;
          await check.run(caller.use(contract, provider), expect);
        } finally {
          await caller.drop();
        }
      });
    });
