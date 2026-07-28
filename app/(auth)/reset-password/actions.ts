"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { findValidToken, markTokenUsed } from "@/lib/db/queries/verificationTokens";
import { setPasswordHash } from "@/lib/db/queries/users";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";
import { hashToken } from "@/lib/auth/tokens";

export type ResetPasswordState = { error?: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "reset-password"), 10, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const record = await findValidToken(hashToken(parsed.data.token), "password_reset");
  if (!record) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await setPasswordHash(String(record.userId), passwordHash);
  await markTokenUsed(String(record._id));
  // Resetting the password invalidates every existing session, in case the
  // reset was triggered because a session/device was compromised.
  await revokeAllSessions(String(record.userId));

  redirect("/login?reset=success");
}
