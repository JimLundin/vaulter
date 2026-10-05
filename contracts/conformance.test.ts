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
for (const { suite, providers } of repo.suites)
  for (const provider of providers)
    describe(`${suite.contract.key} by ${provider}`, () => {
      it.each(suite.checks.map((check) => [check.name, check] as const))('%s', async (_, check) => {
        const caller = repo.kernel.caller(`check-${++n}`);
        try {
          await check.run(caller.use(suite.contract, provider), expect);
        } finally {
          await caller.drop();
        }
      });
    });
