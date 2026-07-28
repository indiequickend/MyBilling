import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { generate } from "otplib";
import { connectToDatabase } from "../../lib/db/connect";
import { createUser } from "../../lib/db/queries/users";
import { createBusinessWithOwner } from "../../lib/db/queries/businesses";
import { hashPassword } from "../../lib/auth/password";
import { Business } from "../../lib/db/models/Business";
import { Role } from "../../lib/db/models/Role";
import { Membership } from "../../lib/db/models/Membership";
import { User } from "../../lib/db/models/User";

const DEV_MAIL_DIR = path.resolve(__dirname, "../../.dev-mail");
const ADMIN_PASSWORD = "Admin1234Secure!";

function readDevMailLink(email: string, pathFragment: string): string {
  const file = path.join(DEV_MAIL_DIR, `${email.replace(/[^a-z0-9@.-]/gi, "_")}.json`);
  const content = JSON.parse(fs.readFileSync(file, "utf8")) as { text: string };
  const match = new RegExp(`(https?://\\S*${pathFragment}\\S*)`).exec(content.text);
  if (!match) throw new Error(`No ${pathFragment} link found in dev mail for ${email}`);
  return match[1];
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // Wait for the redirect away from /login (either straight to "/" or to the
  // 2FA step) rather than assuming the click's server round-trip is done —
  // makes a failed login fail loudly here instead of timing out later on an
  // unrelated locator.
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/login") || url.pathname === "/login/2fa",
    {
      timeout: 15_000,
    },
  );
}

test.describe.serial("auth + tenancy + RBAC (Phase 1)", () => {
  const suffix = Date.now();
  const adminEmail = `e2e-admin-${suffix}@example.com`;
  const inviteeEmail = `e2e-invitee-${suffix}@example.com`;
  let adminUserId: string;
  let businessId: string;
  let limitedRoleId: string;

  test.beforeAll(async () => {
    await connectToDatabase();
    // Provision the admin directly (bypassing /setup, which only works on a
    // literally-empty instance) so this suite is safe to run repeatedly.
    const user = await createUser({
      email: adminEmail,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      name: "E2E Admin",
      emailVerifiedAt: new Date(),
    });
    adminUserId = String(user._id);
    const result = await createBusinessWithOwner({
      name: `E2E Business ${suffix}`,
      ownerUserId: adminUserId,
    });
    businessId = result.businessId;
  });

  test.afterAll(async () => {
    const invitee = await User.findOne({ email: inviteeEmail });
    const userIds = [adminUserId, invitee?._id].filter(Boolean);
    await Promise.all([
      User.deleteMany({ _id: { $in: userIds } }),
      Business.deleteMany({ _id: businessId }),
      Role.deleteMany({ businessId }),
      Membership.deleteMany({ businessId }),
    ]);
    for (const email of [adminEmail, inviteeEmail]) {
      const file = path.join(DEV_MAIL_DIR, `${email.replace(/[^a-z0-9@.-]/gi, "_")}.json`);
      fs.rmSync(file, { force: true });
    }
  });

  test("admin logs in and reaches the dashboard", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("admin creates a limited role with no user-management permission", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/settings/roles");

    // Use the "start from scratch" form (all permissions unchecked by
    // default) — the template form would grant Admin-level access instead.
    const scratchSection = page.getByTestId("scratch-role-form");
    await scratchSection.getByLabel("Role name").fill("Limited");
    await scratchSection.getByRole("button", { name: "Create role" }).click();
    await expect(page.getByText('Role "Limited" created.')).toBeVisible();

    const role = await Role.findOne({ businessId, name: "Limited" });
    expect(role).not.toBeNull();
    limitedRoleId = String(role!._id);
  });

  test("admin invites a new user, who accepts and logs in pre-verified", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/settings/users");
    await page.getByLabel("Email to invite").fill(inviteeEmail);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText(`Invitation sent to ${inviteeEmail}.`)).toBeVisible();

    const acceptUrl = readDevMailLink(inviteeEmail, "/accept-invite");
    await page.context().clearCookies(); // act as a brand-new visitor, not the logged-in admin
    await page.goto(acceptUrl);
    await page.getByLabel("Your name").fill("E2E Invitee");
    await page.getByLabel("Password", { exact: true }).fill("Invitee1234Secure!");
    await page.getByRole("button", { name: "Accept & create account" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // The invited user is logged in immediately — confirm a fresh login also works.
    await page.context().clearCookies();
    await loginAs(page, inviteeEmail, "Invitee1234Secure!");
    await expect(page).toHaveURL("/");
  });

  test("a membership without settings.manage_users gets 403 from the users API", async ({
    page,
    request,
  }) => {
    // Reassign the invitee to the permission-less "Limited" role, then hit the
    // API directly as them — this is the server-side enforcement check, not
    // just "the page happens to hide the link".
    const invitee = await User.findOne({ email: inviteeEmail });
    await Membership.findOneAndUpdate(
      { userId: invitee!._id, businessId },
      { $set: { roleId: limitedRoleId } },
    );

    await loginAs(page, inviteeEmail, "Invitee1234Secure!");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await request.get("/api/users", { headers: { cookie: cookieHeader } });
    expect(response.status()).toBe(403);
  });

  test("2FA: enroll, log out, and a code is required to log back in", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/settings/profile");
    await page.getByRole("button", { name: "Enable 2FA" }).click();

    const secret = await page.getByTestId("totp-secret").innerText();
    const code = await generate({ secret });
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/backup codes/i)).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await expect(page).toHaveURL("/login/2fa");

    const secondCode = await generate({ secret });
    await page.getByLabel("6-digit code or backup code").fill(secondCode);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Clean up so later runs of this suite don't inherit a 2FA-locked admin account.
    await User.findByIdAndUpdate(adminUserId, {
      $set: { totpEnabled: false },
      $unset: { totpSecret: 1, backupCodeHashes: 1 },
    });
  });

  test("revoking a session from the Profile page logs that session out", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/settings/profile");

    // The admin has accumulated several sessions from earlier tests in this
    // suite, and which row is "this browser's own session" isn't exposed in
    // the UI — so revoke listed sessions one at a time (most-recently-active
    // first, so this test's own fresh login is tried first) until one of them
    // is the current session, proven by the next navigation bouncing to
    // /login. Bounded, rather than an unbounded loop, so a real regression
    // fails fast instead of exhausting the whole test timeout.
    const revokeButton = page.getByRole("button", { name: "Revoke" });
    let loggedOut = false;
    for (let i = 0; i < 10 && !loggedOut; i++) {
      if ((await revokeButton.count()) === 0) break;
      await revokeButton.first().click();
      await page.waitForTimeout(500); // let the Server Action's revalidation settle
      await page.goto("/settings/profile");
      loggedOut = page.url().includes("/login");
    }
    expect(loggedOut).toBe(true);
  });

  test("creating a second business never leaks the first business's members", async ({ page }) => {
    await loginAs(page, adminEmail, ADMIN_PASSWORD);
    await page.goto("/businesses/new");
    await page.getByLabel("Business name").fill(`E2E Business Two ${suffix}`);
    await page.getByRole("button", { name: "Create business" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    await page.goto("/settings/users");
    await expect(page.getByText(inviteeEmail)).not.toBeVisible();

    // cleanup this second business too
    const secondBusiness = await Business.findOne({ name: `E2E Business Two ${suffix}` });
    if (secondBusiness) {
      await Promise.all([
        Business.deleteOne({ _id: secondBusiness._id }),
        Role.deleteMany({ businessId: secondBusiness._id }),
        Membership.deleteMany({ businessId: secondBusiness._id }),
      ]);
    }
  });
});
