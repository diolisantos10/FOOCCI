import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for chat-sim browser validation.
 * Specs live in tests/qa/specs/.
 *
 * When BASE_URL is not set, Playwright auto-starts the Next.js dev server
 * on port 3000 and waits for it to be ready before running any test.
 * If a server is already listening on that port it is reused as-is.
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
    // Attach the internal E2E bypass token to every request so the
    // middleware allows /chat-sim without a real user session.
    // Has no effect when E2E_SECRET is not set (token will be empty string).
    extraHTTPHeaders: {
      ...(process.env.E2E_SECRET ? { "x-e2e-token": process.env.E2E_SECRET } : {}),
    },
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

  // Auto-start the dev server when no external BASE_URL is provided.
  // reuseExistingServer: true means if the app is already running (e.g. npm run dev
  // in a separate terminal) Playwright will use it instead of starting a new one.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env as Record<string, string>,
        },
      },
});
