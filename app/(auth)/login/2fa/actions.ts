"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { totpChallengeSchema } from "@/lib/validation/auth";
import { findUserByIdWithSecrets, consumeBackupCodeHash } from "@/lib/db/queries/users";
import { verifyTotpCode, findMatchingBackupCodeHash } from "@/lib/auth/totp";
import { getPendingLoginUserId, clearPendingLogin } from "@/lib/auth/pendingLogin";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";
import { recordLoginAudit } from "@/lib/db/queries/auditLog";

export type TwoFactorState = { error?: string };

export async function verifyTotpAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const userId = await getPendingLoginUserId();
  if (!userId) {
    redirect("/login");
  }

  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "2fa"), 10, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = totpChallengeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: "Enter your 6-digit code or a backup code." };
  }

  const user = await findUserByIdWithSecrets(userId);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    await clearPendingLogin();
    redirect("/login");
  }

  const code = parsed.data.code;
  const totpOk = await verifyTotpCode(user.totpSecret, code);

  if (!totpOk) {
    const matchedHash = await findMatchingBackupCodeHash(user.backupCodeHashes ?? [], code);
    if (!matchedHash) {
      return { error: "Invalid code." };
    }
    await consumeBackupCodeHash(String(user._id), matchedHash);
  }

  await clearPendingLogin();
  await createSession(String(user._id));
  await recordLoginAudit(String(user._id), "login.success", user.email);
  redirect("/");
}
