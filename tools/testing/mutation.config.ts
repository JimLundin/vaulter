import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.ts';

// Reuse application transforms and aliases; exercise node behavior and its recovery consumer.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'behavior',
          include: ['app/vault/nodes/*.test.ts', 'app/vault/transactions/lifetime.test.ts'],
          maxWorkers: 1,
        },
      },
    ],
  },
});
