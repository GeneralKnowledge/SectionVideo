import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const databaseUrl = "./data/e2e-curator.db";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `rm -f ${databaseUrl} ${databaseUrl}-shm ${databaseUrl}-wal && npx next dev --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_SECRET: "playwright-test-auth-secret-at-least-sixteen",
      CURATOR_EMAIL: "curator@example.com",
      CURATOR_PASSWORD: "correct-horse-battery",
      CURATOR_NAME: "Playwright Curator",
      DATABASE_URL: databaseUrl,
      YOUTUBE_API_KEY: "",
      OPENAI_API_KEY: "",
    },
  },
});
