"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { findUserByEmail } from "@/lib/db/queries/users";
import {
  createVerificationToken,
  invalidateTokensForUser,
} from "@/lib/db/queries/verificationTokens";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/mailer";
import { absoluteUrl } from "@/lib/auth/urls";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type ForgotPasswordState = { error?: string };

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "forgot-password"), 5, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }
  const { email } = parsed.data;

  // Same response whether or not the account exists, to avoid leaking which emails are registered.
  const user = await findUserByEmail(email);
  if (user) {
    await invalidateTokensForUser(String(user._id), "password_reset");
    const token = generateToken();
    await createVerificationToken({
      userId: String(user._id),
      purpose: "password_reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await sendPasswordResetEmail(email, absoluteUrl(`/reset-password?token=${token}`));
  }

  redirect(`/check-email?purpose=reset&email=${encodeURIComponent(email)}`);
}
