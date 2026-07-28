"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/context";
import { updateProfileSchema, totpChallengeSchema } from "@/lib/validation/auth";
import {
  updateUserProfile,
  softDeleteUser,
  findUserByIdWithSecrets,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
} from "@/lib/db/queries/users";
import {
  generateTotpSecret,
  buildProvisioningUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
} from "@/lib/auth/totp";
import { revokeCurrentSession, revokeAllSessions, revokeSessionForUser } from "@/lib/auth/session";

export type ProfileState = { error?: string; success?: string };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateUserProfile(String(user._id), {
    name: parsed.data.name,
    phone: parsed.data.phone || undefined,
  });
  return { success: "Profile updated." };
}

export async function revokeSessionAction(sessionId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await revokeSessionForUser(sessionId, String(user._id));
}

export async function deleteAccountAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await revokeAllSessions(String(user._id));
  await softDeleteUser(String(user._id));
  await revokeCurrentSession();
  redirect("/login");
}

// --- 2FA enrollment (called directly from the client component, not via useActionState) ---

export async function startTotpEnrollmentAction(): Promise<{ qrDataUrl: string; secret: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const secret = generateTotpSecret();
  await setPendingTotpSecret(String(user._id), secret);
  const uri = buildProvisioningUri(secret, user.email);
  const qrDataUrl = await generateQrCodeDataUrl(uri);
  // Returned alongside the QR so it can be entered manually (accessibility —
  // not everyone can scan a QR code with the device they're enrolling on).
  return { qrDataUrl, secret };
}

export async function confirmTotpEnrollmentAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; backupCodes?: string[] }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = totpChallengeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const fresh = await findUserByIdWithSecrets(String(user._id));
  if (!fresh?.totpSecret) {
    return { ok: false, error: "Enrollment expired — start again." };
  }

  const codeOk = await verifyTotpCode(fresh.totpSecret, parsed.data.code);
  if (!codeOk) {
    return { ok: false, error: "Incorrect code. Try again." };
  }

  const backupCodes = generateBackupCodes();
  const hashes = await hashBackupCodes(backupCodes);
  await enableTotp(String(user._id), fresh.totpSecret, hashes);

  return { ok: true, backupCodes };
}

export async function disableTotpAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await disableTotp(String(user._id));
  redirect("/settings/profile");
}
