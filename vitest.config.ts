import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { requireTestScope } from './tools/testing/test-scope.ts';

requireTestScope('vitest', process.argv.slice(2));

const root = fileURLToPath(new URL('.', import.meta.url));
const architecture = [
  'tools/architecture/layout.test.ts',
  'tools/architecture/composition.test.ts',
  'tools/architecture/catalogue.test.ts',
];

export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('app', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'behavior',
          include: ['app/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
          exclude: [...architecture, '**/*.browser.test.ts'],
          maxWorkers: Math.min(4, availableParallelism()),
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'architecture',
          include: architecture,
          // Each file opens compiler projects; keep their memory use separate from behavior tests.
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
