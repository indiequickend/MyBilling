import { test, expect, type Page } from "@playwright/test";
import { connectToDatabase } from "../../lib/db/connect";
import { createUser } from "../../lib/db/queries/users";
import { createBusinessWithOwner } from "../../lib/db/queries/businesses";
import { createCustomer } from "../../lib/db/queries/customers";
import { hashPassword } from "../../lib/auth/password";
import { Business } from "../../lib/db/models/Business";
import { Role } from "../../lib/db/models/Role";
import { Membership } from "../../lib/db/models/Membership";
import { Customer } from "../../lib/db/models/Customer";
import { User } from "../../lib/db/models/User";

const PASSWORD = "SwitchTest1234Secure!";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

// Covers build_phases.md Phase 13's literal verify step: "switching businesses in the UI never
// shows a flash of the previous business's data." Business A/B each carry a distinctly-named
// Customer record; switching must never render Business A's data while on Business B or vice versa.
test.describe.serial("multi-business switching — no cross-tenant data flash (Phase 13)", () => {
  const suffix = Date.now();
  const email = `e2e-switch-${suffix}@example.com`;
  let userId: string;
  let businessAId: string;
  let businessBId: string;
  let businessAName: string;
  let businessBName: string;

  test.beforeAll(async () => {
    await connectToDatabase();
    const user = await createUser({
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "E2E Switch Tester",
      emailVerifiedAt: new Date(),
    });
    userId = String(user._id);

    businessAName = `E2E Switch Business A ${suffix}`;
    businessBName = `E2E Switch Business B ${suffix}`;
    const resultA = await createBusinessWithOwner({ name: businessAName, ownerUserId: userId });
    businessAId = resultA.businessId;
    const resultB = await createBusinessWithOwner({ name: businessBName, ownerUserId: userId });
    businessBId = resultB.businessId;

    await createCustomer({ businessId: businessAId, displayName: `Acme A-Only ${suffix}` });
    await createCustomer({ businessId: businessBId, displayName: `Acme B-Only ${suffix}` });
  });

  test.afterAll(async () => {
    const businessIds = [businessAId, businessBId];
    await Promise.all([
      User.deleteOne({ _id: userId }),
      Business.deleteMany({ _id: { $in: businessIds } }),
      Role.deleteMany({ businessId: { $in: businessIds } }),
      Membership.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
  });

  test("switching from Business A to Business B never renders A's customer, and shows B's", async ({
    page,
  }) => {
    await loginAs(page, email, PASSWORD);

    // Whichever of the two businesses happens to be active by default (see
    // listBusinessesForUser/getDashboardContext's cookie-or-first fallback), switch to A first so
    // the test doesn't depend on that ordering — match the switcher button by a name prefix
    // rather than assuming which business's name it currently shows.
    const switcherButton = page.getByRole("button", { name: /^E2E Switch Business/ });
    await page.goto("/customers");
    await switcherButton.click();
    await page.getByRole("menuitem", { name: businessAName }).click();
    await page.waitForURL("/");

    await page.goto("/customers");
    await expect(page.getByText(`Acme A-Only ${suffix}`)).toBeVisible();
    await expect(page.getByText(`Acme B-Only ${suffix}`)).not.toBeVisible();

    // Switch to B via the switcher UI (not by navigating directly) — this is the actual mechanism
    // build_phases.md's verify step is about.
    await switcherButton.click();
    await page.getByRole("menuitem", { name: businessBName }).click();
    await page.waitForURL("/");

    // A full navigation occurred (switchBusinessAction redirects to "/") — by the time /customers
    // is requested, the server resolves the now-updated cookie, so there is no client-side
    // in-place re-fetch step where A's data could ever flash before B's.
    await page.goto("/customers");
    await expect(page.getByText(`Acme B-Only ${suffix}`)).toBeVisible();
    await expect(page.getByText(`Acme A-Only ${suffix}`)).not.toBeVisible();
  });
});
