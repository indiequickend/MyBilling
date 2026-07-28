"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { setupSchema } from "@/lib/validation/auth";
import { countUsers, createUser } from "@/lib/db/queries/users";
import { createBusinessWithOwner } from "@/lib/db/queries/businesses";
import { hashPassword } from "@/lib/auth/password";
import { createVerificationToken } from "@/lib/db/queries/verificationTokens";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/auth/mailer";
import { absoluteUrl } from "@/lib/auth/urls";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type SetupState = { error?: string };

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  // Self-disabling: only usable while the instance has zero users.
  if ((await countUsers()) > 0) {
    redirect("/login");
  }

  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "setup"), 5, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, email, password, businessName } = parsed.data;
  const passwordHash = await hashPassword(password);
  const user = await createUser({ email, passwordHash, name });
  await createBusinessWithOwner({ name: businessName, ownerUserId: String(user._id) });

  const token = generateToken();
  await createVerificationToken({
    userId: String(user._id),
    purpose: "email_verify",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await sendVerificationEmail(email, absoluteUrl(`/verify-email?token=${token}`));

  redirect(`/check-email?purpose=verify&email=${encodeURIComponent(email)}`);
}
