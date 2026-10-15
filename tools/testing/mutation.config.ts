import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.ts';

// Reuse application transforms and aliases; keep the pilot's test scope explicit.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'behavior',
          include: ['app/vault/nodes/*.test.ts'],
          maxWorkers: 1,
        },
      },
    ],
  },
});
