import { expect, test } from 'vitest';
import { requireTestScope } from './test-scope.ts';

test.each([
  ['vitest', []],
  ['vitest', ['run']],
  ['vitest', ['run', '--project', 'behavior']],
  ['vitest', ['run', '--project=architecture', '--maxWorkers', '1']],
  ['vitest', ['run', '--reporter', 'dot', '--exclude', 'app/foo.test.ts']],
  ['vitest', ['run', '-t', '.*']],
  ['vitest', ['watch', 'app/']],
  ['playwright', []],
  ['playwright', ['--project', 'desktop', 'phone']],
  ['playwright', ['--workers', '2', '--shard=1/4']],
  ['playwright', ['--config', 'tools/testing/production.config.ts']],
  ['playwright', ['--reporter', 'list', '--output', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--grep-invert', 'a test', '--grep', '.*']],
  ['playwright', ['app/']],
  ['playwright', ['--', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--debug', 'inspector', '--shuffle', '42']],
  ['playwright', ['--last-failed']],
  ['all', ['app/workflows/chat']],
] satisfies ['vitest' | 'playwright' | 'all', string[]][])(
  '%s rejects an unscoped local invocation: %j',
  (runner, args) => {
    expect(() => requireTestScope(runner, args, {})).toThrow('Full test suites run only');
    expect(() => requireTestScope(runner, args, { CI: 'true' })).toThrow(
      'Full test suites run only',
    );
  },
);

test.each([
  ['vitest', ['run', 'app/workflows/chat', '--project=behavior']],
  ['vitest', ['related', 'app/workflows/chat/node-conversation.ts', '--run']],
  ['vitest', ['run', '--changed']],
  ['vitest', ['run', '--changed=main']],
  ['vitest', ['run', '-t', 'rejects stale writes']],
  ['vitest', ['list']],
  ['vitest', ['--help']],
  ['playwright', ['app/ui/kit/composer.browser.test.ts', '--project=desktop']],
  ['playwright', ['--debug', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--debug', 'inspector', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--shuffle', '42', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--update-snapshots', 'changed', 'app/ui/kit/composer.browser.test.ts']],
  ['playwright', ['--grep', 'composer keeps focus', '--project', 'phone']],
  ['playwright', ['-g=keeps focus']],
  ['playwright', ['--only-changed=main']],
  ['playwright', ['--only-changed']],
  ['playwright', ['app/ui/kit/composer.browser.test.ts', '--last-failed']],
  ['playwright', ['--test-list=selected-tests.txt']],
  ['playwright', ['--list']],
  ['playwright', ['--help']],
] satisfies ['vitest' | 'playwright', string[]][])(
  '%s accepts focused tests or inventory locally: %j',
  (runner, args) => {
    expect(() => requireTestScope(runner, args, {})).not.toThrow();
  },
);

test.each(['vitest', 'playwright', 'all'] as const)(
  '%s permits full runs in GitHub Actions',
  (runner) => {
    expect(() =>
      requireTestScope(runner, [], { CI: 'true', GITHUB_ACTIONS: 'true' }),
    ).not.toThrow();
  },
);
