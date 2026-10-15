import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { requirePlaywrightTestScope } from './tools/testing/test-scope.ts';

requirePlaywrightTestScope();

const port = process.env.VAULTER_UI_PORT ?? '4179';
const fullMatrix = process.env.VAULTER_UI_MATRIX === 'full';

export default defineConfig({
  testDir: './tools/browser',
  timeout: 30_000,
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['blob']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.VAULTER_BROWSER
      ? { executablePath: process.env.VAULTER_BROWSER }
      : {},
  },
  projects: [
    {
      name: 'phone',
      grep: fullMatrix ? undefined : /@phone\b/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'touch-desktop',
      grep: fullMatrix ? undefined : /@touch\b/,
      use: { viewport: { width: 1440, height: 1000 }, hasTouch: true },
    },
  ],
  webServer: {
    env: {
      VAULT_OPENAI_KEY: 'browser-fixture',
      VAULT_OPENAI_API: 'http://127.0.0.1:9/v1',
      VAULT_OPENAI_MODEL: 'fixture-llm',
    },
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    command: `npm exec vite -- --mode design --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/preview/`,
    reuseExistingServer: !process.env.CI,
  },
});
