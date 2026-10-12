import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = process.env.VAULTER_PRODUCTION_PORT ?? '4180';

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results-production',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.VAULTER_BROWSER
      ? { executablePath: process.env.VAULTER_BROWSER }
      : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
