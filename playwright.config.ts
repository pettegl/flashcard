import { defineConfig, devices } from '@playwright/test';

// E2E runs against dist/merged opened from file:// with the network offline (TESTSPEC §2).
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    // Full Chromium in new headless mode (closer to a real WebView than chrome-headless-shell).
    // PW_CHANNEL=chrome uses the installed Google Chrome where policy blocks Playwright's binaries.
    channel: process.env.PW_CHANNEL ?? 'chromium',
    offline: true,
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
});
