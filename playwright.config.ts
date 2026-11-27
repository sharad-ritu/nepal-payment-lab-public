import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:45173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Human-started apps only. Never launch app servers from the test runner.
  projects: [
    {
      name: "public",
      testMatch: "**/public.e2e.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "dashboard",
      testMatch: "**/dashboard.e2e.ts",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
  ],
});
