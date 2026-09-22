import { defineConfig } from 'vitest/config';
import path from 'path';

const rootAlias = {
  '@': path.resolve(import.meta.dirname, './'),
};

export default defineConfig({
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    projects: [
      {
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          setupFiles: ['./tests/integration/setup.ts'],
          globalSetup: ['./tests/integration/global-setup.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
