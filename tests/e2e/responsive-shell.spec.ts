import { test, expect, type Page } from "@playwright/test";
import { connectToDatabase } from "../../lib/db/connect";
import { createUser } from "../../lib/db/queries/users";
import { createBusinessWithOwner } from "../../lib/db/queries/businesses";
import { createRole } from "../../lib/db/queries/roles";
import { hashPassword } from "../../lib/auth/password";
import { emptyPermissionMatrix } from "../../lib/rbac/permissions";
import { Business } from "../../lib/db/models/Business";
import { Role } from "../../lib/db/models/Role";
import { Membership } from "../../lib/db/models/Membership";
import { User } from "../../lib/db/models/User";

const PASSWORD = "ShellTest1234Secure!";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

// build_phases.md Phase 15: the RBAC-filtered nav (bottom tab bar + "More"
// sheet on mobile, sidebar on desktop) must show exactly what a role is
// permitted to see — no more, no less — mirrored across both renderers.
test.describe.serial("responsive app shell (Phase 15)", () => {
  // This spec runs under three projects (chromium/mobile/tablet) concurrently
  // — a plain Date.now() suffix risks colliding across workers started in the
  // same millisecond, which would fail beforeAll on a duplicate email.
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `e2e-shell-admin-${suffix}@example.com`;
  const limitedEmail = `e2e-shell-limited-${suffix}@example.com`;
  let adminUserId: string;
  let limitedUserId: string;
  let businessId: string;
  let limitedRoleId: string;

  test.beforeAll(async () => {
    await connectToDatabase();
    const admin = await createUser({
      email: adminEmail,
      passwordHash: await hashPassword(PASSWORD),
      name: "Shell Admin",
      emailVerifiedAt: new Date(),
    });
    adminUserId = String(admin._id);
    const result = await createBusinessWithOwner({
      name: `E2E Shell Business ${suffix}`,
      ownerUserId: adminUserId,
    });
    businessId = result.businessId;

    // A role that can only see Customers — everything else (Invoices,
    // Payments, Reports, Settings, ...) must be absent from both the
    // bottom-tab bar's "More" sheet and (at desktop width) the sidebar.
    const permissions = emptyPermissionMatrix();
    permissions.customers = { ...permissions.customers, view: true };
    const limitedRole = await createRole({
      businessId,
      name: "Shell Limited",
      permissions: permissions as never,
    });
    limitedRoleId = String(limitedRole._id);

    const limited = await createUser({
      email: limitedEmail,
      passwordHash: await hashPassword(PASSWORD),
      name: "Shell Limited",
      emailVerifiedAt: new Date(),
    });
    limitedUserId = String(limited._id);
    await Membership.create({
      userId: limitedUserId,
      businessId,
      roleId: limitedRoleId,
      status: "active",
    });
  });

  test.afterAll(async () => {
    const userIds = [adminUserId, limitedUserId];
    await Promise.all([
      User.deleteMany({ _id: { $in: userIds } }),
      Business.deleteMany({ _id: businessId }),
      Role.deleteMany({ businessId }),
      Membership.deleteMany({ businessId }),
    ]);
  });

  // Branch on project name, not the `isMobile` fixture: a 768px "tablet"
  // viewport sits exactly on Tailwind's `md` breakpoint, which per this
  // app's own design (SidebarNav at `≥md`, BottomTabBar below it) renders
  // the *desktop* shell, not the mobile one. "mobile" (390px) is the only
  // project below that cutover.
  function isBottomBarProject(testInfo: { project: { name: string } }) {
    return testInfo.project.name === "mobile";
  }

  test("desktop/tablet: sidebar is visible, the bottom tab bar is not", async ({ page }, testInfo) => {
    test.skip(isBottomBarProject(testInfo), "sidebar-shell assertion (chromium + tablet)");
    await loginAs(page, adminEmail, PASSWORD);
    await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "MyBilling" })).toBeVisible();
  });

  test("mobile: bottom tab bar is visible and its tabs navigate", async ({ page }, testInfo) => {
    test.skip(!isBottomBarProject(testInfo), "bottom-tab-bar-shell assertion (mobile only)");
    await loginAs(page, adminEmail, PASSWORD);
    // Next dev mode can still be finishing client hydration for a moment
    // after the server-rendered redirect lands — wait for it to settle
    // before the tab bar's Link needs its click handler attached.
    await page.waitForLoadState("networkidle");
    const tabBar = page.getByRole("navigation", { name: "Primary" });
    await expect(tabBar).toBeVisible();

    await tabBar.getByRole("link", { name: "Invoices" }).click();
    await expect(page).toHaveURL(/\/sales\/invoices/);
    // Each Next dev-mode navigation re-triggers the same hydration lag as
    // the initial page load, before the freshly-mounted tab bar's next
    // Link is actually clickable.
    await page.waitForLoadState("networkidle");

    await tabBar.getByRole("link", { name: "Payments" }).click();
    await expect(page).toHaveURL(/\/payments/);
  });

  test("More sheet shows only RBAC-permitted items for a limited role, admin sees more", async ({
    page,
  }, testInfo) => {
    test.skip(!isBottomBarProject(testInfo), "the More sheet only exists in the mobile bottom-tab shell");
    await loginAs(page, limitedEmail, PASSWORD);
    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Customers" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Invoices" })).not.toBeVisible();
    // "Settings" itself always appears (its "Profile" child has no permission
    // gate — every authenticated member can manage their own profile) — the
    // real RBAC check is a properly-gated item like Reports (reports.view).
    await expect(sheet.getByRole("link", { name: "Reports" })).not.toBeVisible();
    await page.keyboard.press("Escape");

    await loginAs(page, adminEmail, PASSWORD);
    await page.getByRole("button", { name: "More" }).click();
    const adminSheet = page.getByRole("dialog");
    await expect(adminSheet.getByRole("link", { name: "Customers" })).toBeVisible();
    await expect(adminSheet.getByRole("link", { name: "Invoices" })).toBeVisible();
    await expect(adminSheet.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  test("quick-create is entirely absent when none of its shortcuts are permitted, present with the right ones otherwise", async ({
    page,
  }, testInfo) => {
    test.skip(!isBottomBarProject(testInfo), "quick-create is a mobile-only affordance");
    // The limited role has customers.view but not .create, and no
    // sales_invoices/payments access at all — none of QuickCreateSheet's
    // three candidates match, so the whole trigger button never renders
    // (QuickCreateSheet returns null for an empty item list) rather than
    // opening onto an empty sheet.
    await loginAs(page, limitedEmail, PASSWORD);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Quick create" })).not.toBeVisible();

    await loginAs(page, adminEmail, PASSWORD);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Quick create" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Invoice" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Customer" })).toBeVisible();
  });

  test("offline fallback renders when the network is unreachable", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "viewport-independent; only needs to run once");
    await loginAs(page, adminEmail, PASSWORD);
    await context.setOffline(true);
    await page.goto("/settings/profile").catch(() => {});
    await expect(page.getByText("You're offline", { exact: true })).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });
});
