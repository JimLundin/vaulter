import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireTestScope } from './test-scope.ts';

const require = createRequire(import.meta.url);
const [command, ...args] = process.argv.slice(2);

try {
  if (command !== 'vitest' && command !== 'playwright' && command !== 'playwright-matrix') {
    throw new Error(`Unknown test runner: ${command}`);
  }
  const runner = command === 'vitest' ? 'vitest' : 'playwright';
  requireTestScope(runner, runner === 'playwright' && args[0] === 'test' ? args.slice(1) : args);
  const entry =
    runner === 'vitest'
      ? fileURLToPath(new URL('vitest.mjs', pathToFileURL(require.resolve('vitest/package.json'))))
      : require.resolve('@playwright/test/cli');
  const child = spawn(process.execPath, [entry, ...args], {
    stdio: 'inherit',
    env:
      command === 'playwright-matrix' ? { ...process.env, VAULTER_UI_MATRIX: 'full' } : process.env,
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
