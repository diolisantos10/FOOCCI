import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for chat-sim browser validation.
 * Specs live in tests/qa/specs/.
 * Requires a running Next.js dev server: `npm run dev`
 */
export default defineConfig({
  testDir: "./tests/qa/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // Use the pre-installed Chromium to avoid needing network download
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ??
        "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Give the app enough time to load menu data from the API
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
