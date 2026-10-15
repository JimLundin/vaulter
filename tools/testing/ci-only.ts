import { requireTestScope } from './test-scope.ts';

try {
  requireTestScope('all', []);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
