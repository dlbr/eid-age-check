import { defineConfig, devices } from "@playwright/test";

const port = process.env.AGE_CHECK_E2E_PORT ?? "4177";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:" + port,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm exec vite --config vite.e2e.config.ts --host 127.0.0.1 --port " + port,
    url: "http://127.0.0.1:" + port + "/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
