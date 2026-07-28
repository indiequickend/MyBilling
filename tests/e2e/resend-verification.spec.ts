import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { connectToDatabase } from "../../lib/db/connect";
import { createUser } from "../../lib/db/queries/users";
import { hashPassword } from "../../lib/auth/password";
import { User } from "../../lib/db/models/User";

const DEV_MAIL_DIR = path.resolve(__dirname, "../../.dev-mail");

function devMailFilePath(email: string) {
  return path.join(DEV_MAIL_DIR, `${email.replace(/[^a-z0-9@.-]/gi, "_")}.json`);
}

function readDevMailFile(email: string) {
  return JSON.parse(fs.readFileSync(devMailFilePath(email), "utf8")) as {
    text: string;
    sentAt: string;
  };
}

function extractVerifyLink(text: string): string {
  const match = /(https?:\/\/\S*\/verify-email\?token=\S+)/.exec(text);
  if (!match) throw new Error("No verify-email link found in dev mail");
  return match[1];
}

test.describe("resend verification email", () => {
  const email = `resend-test-${Date.now()}@example.com`;
  const password = "ResendTest1234!";
  let userId: string;

  test.beforeAll(async () => {
    await connectToDatabase();
    const user = await createUser({
      email,
      passwordHash: await hashPassword(password),
      name: "Resend Test",
    });
    userId = String(user._id);
  });

  test.afterAll(async () => {
    await User.deleteOne({ _id: userId });
    fs.rmSync(devMailFilePath(email), { force: true });
  });

  test("resend issues a new working link, then no-ops once already verified", async ({ page }) => {
    // Land on check-email the same way login does for an unverified account.
    await page.goto(`/check-email?purpose=verify&email=${encodeURIComponent(email)}`);
    await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();

    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(
      page.getByText("If that account needs verification, a new link has been sent."),
    ).toBeVisible();

    const link = extractVerifyLink(readDevMailFile(email).text);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

    const user = await User.findById(userId);
    expect(user?.emailVerifiedAt).toBeTruthy();

    // Resending again for an already-verified account gives the same
    // generic response (never reveals verification state) but sends nothing.
    const beforeSentAt = readDevMailFile(email).sentAt;
    await page.goto(`/check-email?purpose=verify&email=${encodeURIComponent(email)}`);
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(
      page.getByText("If that account needs verification, a new link has been sent."),
    ).toBeVisible();
    expect(readDevMailFile(email).sentAt).toBe(beforeSentAt);
  });
});
