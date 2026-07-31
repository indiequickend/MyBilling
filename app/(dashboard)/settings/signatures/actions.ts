"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { signatureSchema } from "@/lib/validation/signatures";
import {
  findSignatureById,
  createSignature,
  updateSignature,
  setDefaultSignature,
  softDeleteSignature,
  restoreSignature,
} from "@/lib/db/queries/signatures";
import { uploadFile, deleteFile } from "@/lib/storage/cloudinary";
import { detectImageMimeType } from "@/lib/storage/imageMime";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type SignatureFormState = { error?: string; fieldErrors?: Record<string, string> };

async function requireDocumentSettingsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_document_settings");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function createSignatureAction(
  _prev: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const context = await requireDocumentSettingsPermission();

  const parsed = signatureSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Upload a signature image." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) {
    return { error: "Signature must be a PNG, JPEG, or WEBP image." };
  }
  const uploaded = await uploadFile(buffer, mimeType, {
    folder: `businesses/${context.activeBusinessId}/signatures`,
  });

  await createSignature({
    businessId: context.activeBusinessId,
    name: parsed.data.name,
    imagePublicId: uploaded.publicId,
    imageUrl: uploaded.url,
  });
  revalidatePath("/settings/signatures");
  redirect("/settings/signatures");
}

export async function updateSignatureAction(
  _prev: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const context = await requireDocumentSettingsPermission();
  const signatureId = String(formData.get("signatureId") ?? "");

  const parsed = signatureSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  let imageUpdate: { imagePublicId?: string; imageUrl?: string } = {};
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType) return { error: "Signature must be a PNG, JPEG, or WEBP image." };
    const uploaded = await uploadFile(buffer, mimeType, {
      folder: `businesses/${context.activeBusinessId}/signatures`,
    });
    const existing = await findSignatureById(signatureId, context.activeBusinessId);
    if (existing?.imagePublicId) await deleteFile(existing.imagePublicId).catch(() => {});
    imageUpdate = { imagePublicId: uploaded.publicId, imageUrl: uploaded.url };
  }

  await updateSignature(signatureId, context.activeBusinessId, { name: parsed.data.name, ...imageUpdate });
  revalidatePath("/settings/signatures");
  redirect("/settings/signatures");
}

export async function setDefaultSignatureAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const signatureId = String(formData.get("signatureId") ?? "");
  if (!signatureId) return;
  await setDefaultSignature(signatureId, context.activeBusinessId);
  revalidatePath("/settings/signatures");
}

export async function softDeleteSignatureAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const signatureId = String(formData.get("signatureId") ?? "");
  if (!signatureId) return;
  const signature = await softDeleteSignature(signatureId, context.activeBusinessId);
  if (signature) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "signature.deleted",
      target: { type: "signature", id: signatureId, label: signature.name },
    });
  }
  revalidatePath("/settings/signatures");
}

export async function restoreSignatureAction(formData: FormData): Promise<void> {
  const context = await requireDocumentSettingsPermission();
  const signatureId = String(formData.get("signatureId") ?? "");
  if (!signatureId) return;
  const signature = await restoreSignature(signatureId, context.activeBusinessId);
  if (signature) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "signature.restored",
      target: { type: "signature", id: signatureId, label: signature.name },
    });
  }
  revalidatePath("/settings/signatures");
}
