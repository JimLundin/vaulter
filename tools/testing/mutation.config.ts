import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.ts';

// Reuse application transforms and aliases; exercise EAV history, validation and queries.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'behavior',
          include: ['app/vault/eav/*.test.ts', 'app/vault/storage/eav/*.test.ts'],
          maxWorkers: 1,
        },
      },
    ],
  },
});
