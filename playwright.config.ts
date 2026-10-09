import { defineConfig } from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  testDir: './tools/browser',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.VAULTER_BROWSER
      ? { executablePath: process.env.VAULTER_BROWSER }
      : {},
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'touch-desktop', use: { viewport: { width: 1440, height: 1000 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run design -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179/preview/',
    reuseExistingServer: !process.env.CI,
  },
});
