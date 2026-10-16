import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.ts';

// Reuse application transforms and aliases; select traversal and ingress tests at their owner.
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
