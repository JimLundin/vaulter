import { parseCLI } from 'vitest/node';

type TestRunner = 'vitest' | 'playwright' | 'all';

const broadFilters = new Set([
  '.',
  '*',
  '**',
  '.*',
  '^',
  '^.*$',
  'app',
  'tools',
  'tools/browser',
  'tools/production',
]);

function hasFilter(value: string): boolean {
  const normalized = value.trim().replace(/^\.\//, '').replace(/\/$/, '');
  return normalized.length > 0 && !broadFilters.has(normalized);
}

const playwrightBooleanOptions = new Set([
  '--fail-on-flaky-tests',
  '--forbid-only',
  '--fully-parallel',
  '--headed',
  '--ignore-snapshots',
  '--last-failed',
  '--no-deps',
  '--pass-with-no-tests',
  '--quiet',
  '--ui',
  '-x',
]);

const playwrightOptionalOptions = new Map([
  ['--debug', ['inspector', 'cli']],
  ['--run-agents', ['missing', 'all', 'none']],
  ['--update-snapshots', ['all', 'changed', 'missing', 'none', 'default']],
  ['-u', ['all', 'changed', 'missing', 'none', 'default']],
]);

function hasPlaywrightScope(args: string[]): boolean {
  let scoped = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    // Playwright forwards arguments after this separator to test code, not file selection.
    if (argument === '--') break;
    if (!argument.startsWith('-')) {
      scoped ||= hasFilter(argument);
      continue;
    }
    const [option, inlineValue] = argument.split(/[=](.*)/s);
    if (option === '--list' || option === '--help' || option === '-h') return true;
    if (option === '--only-changed') return true;
    if (playwrightBooleanOptions.has(option)) continue;
    const choices = playwrightOptionalOptions.get(option);
    if (choices) {
      if (inlineValue === undefined && choices.includes(args[index + 1])) index++;
      continue;
    }
    if (option === '--shuffle') {
      if (inlineValue === undefined && /^\d+$/.test(args[index + 1] ?? '')) index++;
      continue;
    }

    const value = inlineValue ?? args[++index] ?? '';
    if (option === '--grep' || option === '-g' || option === '--test-list') {
      scoped ||= hasFilter(value);
    }
    // --project consumes multiple values. Selecting devices alone leaves the suite unscoped.
    if (option === '--project' && inlineValue === undefined) {
      while (args[index + 1] && !args[index + 1].startsWith('-')) index++;
    }
    // Other options consume a value conservatively, so output paths, config files and unknown
    // option values cannot accidentally authorize a full run.
  }
  return scoped;
}

function hasVitestScope(args: string[]): boolean {
  if (args[0] === 'list' || args.includes('--help') || args.includes('-h')) return true;
  const { filter, options } = parseCLI(['vitest', ...args]);
  const related = typeof options.related === 'string' ? [options.related] : options.related;
  return (
    filter.some(hasFilter) ||
    !!related?.some(hasFilter) ||
    (options.changed !== undefined && options.changed !== false) ||
    (typeof options.testNamePattern === 'string' && hasFilter(options.testNamePattern))
  );
}

/** Full runs belong to GitHub Actions; local runs must select the behavior being edited. */
export function requireTestScope(
  runner: TestRunner,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.CI === 'true' && environment.GITHUB_ACTIONS === 'true') return;
  if (runner === 'vitest' && hasVitestScope(args)) return;
  if (runner === 'playwright' && hasPlaywrightScope(args)) return;

  const example =
    runner === 'playwright'
      ? 'npm run test:ui -- tools/browser/composer.spec.ts --project=desktop'
      : 'npm run test:fast -- app/workflows/chat';
  throw new Error(
    `Full test suites run only in GitHub Actions. Select a module, spec or test name locally, for example:\n${example}\nCommit and push your feature branch for full verification; inspect CI for that commit. See docs/agents/testing.md.`,
  );
}

export function requirePlaywrightTestScope(): void {
  // Playwright reloads config in IPC workers without the parent's CLI arguments.
  // The parent has already checked the selection before it can start these children.
  if (process.send) return;
  requireTestScope('playwright', process.argv.slice(3));
}
