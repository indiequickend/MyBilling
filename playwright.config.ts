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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Mobile-first PWA shell (build_phases.md Phase 15) — bottom tab bar vs.
    // sidebar breakpoint, safe-area handling, and installability need
    // coverage at a real mobile viewport, not just desktop-with-DevTools.
    // Scoped to the responsive-shell spec only, so the rest of the suite
    // (auth/RBAC/2FA flows, which don't depend on viewport) isn't tripled.
    // Chromium-engine viewport emulation (not the iPhone/iPad device presets,
    // which default to WebKit — an extra browser binary this environment
    // doesn't have installed) is enough to exercise our own CSS breakpoints;
    // real Safari-specific PWA install quirks still need manual verification
    // (see build_phases.md Phase 15 risks).
    // Plain viewport override, no isMobile/hasTouch — those touch-input
    // emulation flags on a non-device Chromium profile made Playwright's
    // .click() unreliable for triggering Next.js Link navigation. Only the
    // viewport width matters for exercising our own CSS breakpoints.
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      testMatch: /responsive-shell\.spec\.ts/,
    },
    // 768px is exactly Tailwind's `md` breakpoint, i.e. the app's own
    // "sidebar at ≥768px" cutover — so "tablet" here deliberately exercises
    // the desktop-shell path, not the bottom-tab-bar path. See the spec.
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
      testMatch: /responsive-shell\.spec\.ts/,
    },
  ],
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
