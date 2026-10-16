import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

function invoke(args: string[]) {
  return spawnSync(process.execPath, ['tools/testing/run.ts', ...args], {
    encoding: 'utf8',
    env: { ...process.env, CI: '', GITHUB_ACTIONS: '' },
  });
}

test.each([
  ['vitest', 'run', '--project=behavior'],
  ['playwright', 'test', '--project=desktop'],
  ['playwright-matrix', 'test', '--project=phone'],
])('rejects unscoped npm runner arguments before launching tests: %j', (...args) => {
  const result = invoke(args);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Full test suites run only in GitHub Actions');
});

test.each([
  ['vitest', '--help'],
  ['playwright', 'test', '--help'],
  ['playwright-matrix', 'test', '--help'],
])('forwards arguments and successful runner exit: %j', (...args) => {
  const result = invoke(args);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage:');
});

test('preserves a runner failure exit code', () => {
  const result = invoke([
    'playwright',
    'test',
    'tools/testing/run.test.ts',
    '--vaulter-invalid-option',
  ]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('unknown option');
});
