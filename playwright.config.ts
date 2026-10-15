import { defineConfig } from '@playwright/test';
import process from 'node:process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const port = process.env.VAULTER_UI_PORT ?? '4179';
const fullMatrix = process.env.VAULTER_UI_MATRIX === 'full';
const bundled = !!process.env.CI || process.env.VAULTER_UI_BUILD === '1';

export default defineConfig({
  testDir: './app',
  testMatch: '**/*.browser.test.ts',
  testIgnore: '**/*.production.browser.test.ts',
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env.CI ? Math.min(4, availableParallelism()) : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['blob'], ['./tools/testing/browser-timings.ts']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
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
    command: bundled
      ? `npm exec vite -- build --mode browser-test --config tools/testing/vite-browser.config.ts && npm exec vite -- preview --mode browser-test --config tools/testing/vite-browser.config.ts --host 127.0.0.1 --port ${port} --strictPort`
      : `npm exec vite -- --mode design --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/preview/`,
    reuseExistingServer: !process.env.CI,
  },
});
