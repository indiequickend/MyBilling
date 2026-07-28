"use server";

import { headers } from "next/headers";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { findUserByEmail } from "@/lib/db/queries/users";
import {
  createVerificationToken,
  invalidateTokensForUser,
} from "@/lib/db/queries/verificationTokens";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/auth/mailer";
import { absoluteUrl } from "@/lib/auth/urls";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type ResendVerificationState = { error?: string; success?: string };

export async function resendVerificationAction(
  _prev: ResendVerificationState,
  formData: FormData,
): Promise<ResendVerificationState> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "resend-verification"), 5, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }
  const { email } = parsed.data;

  // Same response whether the account exists, is already verified, or not —
  // avoids leaking which emails are registered, same as forgot-password.
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    await invalidateTokensForUser(String(user._id), "email_verify");
    const token = generateToken();
    await createVerificationToken({
      userId: String(user._id),
      purpose: "email_verify",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await sendVerificationEmail(email, absoluteUrl(`/verify-email?token=${token}`));
  }

  return { success: "If that account needs verification, a new link has been sent." };
}
