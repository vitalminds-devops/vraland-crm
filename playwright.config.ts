import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/setup/global.ts",
  workers: 1,
  retries: 0,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3100",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "api", testMatch: "api/**/*.spec.ts" },
    {
      name: "ui",
      testMatch: "ui/**/*.spec.ts",
      testIgnore: "ui/mobile-workflows.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    { name: "e2e", testMatch: "e2e/**/*.spec.ts", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      testMatch: ["ui/auth.spec.ts", "ui/mobile-workflows.spec.ts"],
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node --import tsx tests/setup/server.ts",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 360000,
  },
});
