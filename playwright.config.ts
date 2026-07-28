import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "./tests/loadEnv";

// The Playwright test runner process (unlike `next dev`/`next build`) doesn't
// load .env itself — needed here because spec files connect to MongoDB
// directly for setup/cleanup, not just through the app under test.
loadEnvFile();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Generous — Next.js dev mode compiles each route on first hit, which alone
  // can take 20-30s, on top of the actual test steps.
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Dev mode (not `pnpm start`) so the mailer's SMTP-not-configured fallback
    // (console log + .dev-mail/*.json) is active — required for e2e tests
    // that need to read verification/invite links without real email.
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
