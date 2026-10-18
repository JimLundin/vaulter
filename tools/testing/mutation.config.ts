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
          include: [
            'app/application/store/*.test.ts',
            'app/application/persistence/journal/*.test.ts',
          ],
          maxWorkers: 1,
        },
      },
    ],
  },
});
