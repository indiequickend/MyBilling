"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginSchema } from "@/lib/validation/auth";
import { findUserByEmail } from "@/lib/db/queries/users";
import { verifyPassword } from "@/lib/auth/password";
import { isLocked, recordFailedLogin, clearFailedLogins } from "@/lib/auth/lockout";
import { createSession } from "@/lib/auth/session";
import { setPendingLogin } from "@/lib/auth/pendingLogin";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type LoginState = { error?: string };

const GENERIC_ERROR = "Invalid email or password.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "login"), 10, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user) {
    return { error: GENERIC_ERROR };
  }

  if (isLocked(user)) {
    return { error: "This account is temporarily locked due to repeated failed attempts." };
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) {
    await recordFailedLogin(String(user._id));
    return { error: GENERIC_ERROR };
  }
  await clearFailedLogins(String(user._id));

  if (!user.emailVerifiedAt) {
    redirect(`/check-email?purpose=verify&email=${encodeURIComponent(email)}`);
  }

  if (user.totpEnabled) {
    await setPendingLogin(String(user._id));
    redirect("/login/2fa");
  }

  await createSession(String(user._id));
  redirect("/");
}
