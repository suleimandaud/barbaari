import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    trace: "on-first-retry",
    ...devices["Desktop Chrome"]
  },
  webServer: [
    {
      command: "npm --workspace @barbaari/daycare-web run dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: "npm --workspace @barbaari/super-admin run dev",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: "daycare",
      testMatch: /daycare\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:5173" }
    },
    {
      name: "super-admin",
      testMatch: /super-admin\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:5174" }
    }
  ]
});
